/**
 * lib/linkpreview.js — link previews: pure rules. No fetch, no DNS, no Redis.
 * The I/O lives in lib/previewfetch.js.
 *
 *   firstUrl(text)            the first http(s) URL of a message (the client repeats the same rule)
 *   normalizePreviewUrl(raw)  the URL a preview may be fetched for, or null
 *   isPrivateAddress(ip)      loopback, private, link-local, reserved... (IPv4 and IPv6)
 *   detectProvider(url)       youtube | spotify | x | lastfm | instagram | telegram | generic (+ ids)
 *   parseMetaTags(html)       every <meta> of the <head> (first value per key)
 *   parseOpenGraph(html, url) og:*, twitter:*, <title>, <meta name="description">
 *   pageExtras(meta)          author, publication date, video flag, theme color
 *   spotifyDetails(kind, meta) artist and the pt-BR kind line of a Spotify page
 *   previewResult(fields)     the normalized { url, siteName, title, author, description, image,
 *                             provider, publishedAt, video, color }
 */
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { clip } from "./integrations.js";

export const PREVIEW_PREFIX_NAME = "lp:";
export const PREVIEW_TTL_SECONDS = 24 * 60 * 60;   // a result is fetched at most once a day
export const PREVIEW_FAIL_TTL_SECONDS = 60 * 60;   // a failure is retried after an hour
export const PREVIEW_TIMEOUT_MS = 5000;
export const PREVIEW_MAX_BYTES = 512 * 1024;
export const PREVIEW_MAX_REDIRECTS = 3;
export const PREVIEW_USER_AGENT = "NAGORA-LinkPreview/1.0 (+https://etanagora.vercel.app)";
export const MAX_URL_LENGTH = 2048;
// Part of the cache key: bump it when the result shape changes, so old entries
// (kept up to 24 h) are not served in the old shape.
export const PREVIEW_CACHE_VERSION = "v2";

// ── URL in a message ──────────────────────────────────────────────────────

/** Same character class as the client's linkify, for http and https. */
export const LINK_URL_RE = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;

/**
 * Trailing sentence punctuation is not part of the URL; a closing parenthesis
 * is dropped only when it has no opening one in the URL ("(veja https://a.b/x)").
 */
export function trimUrlTail(url) {
  let u = url;
  for (;;) {
    const before = u;
    u = u.replace(/[.,;:!?'"*]+$/, "");
    if (u.endsWith(")") && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
    if (u === before) return u;
  }
}

/** The first http(s) URL in `text`, or null. */
export function firstUrl(text) {
  if (typeof text !== "string" || !text) return null;
  const m = LINK_URL_RE.exec(text);
  if (!m) return null;
  const url = trimUrlTail(m[0]);
  return /^https?:\/\/[^/?#]+/i.test(url) ? url : null;
}

/**
 * The URL a preview may be fetched for: http or https, a host, no
 * credentials, the default port only, no fragment, at most 2048 characters.
 */
export function normalizePreviewUrl(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_URL_LENGTH) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.username || u.password) return null;
  if (u.port && !(u.protocol === "http:" && u.port === "80") && !(u.protocol === "https:" && u.port === "443")) return null;
  u.hash = "";
  const href = u.href;
  return href.length <= MAX_URL_LENGTH ? href : null;
}

/** Redis key part for a normalized URL (hash: bounded length, no odd characters). */
export function previewCacheId(url) {
  return createHash("sha256").update(`${PREVIEW_CACHE_VERSION} ${url}`).digest("hex");
}

// ── Addresses ─────────────────────────────────────────────────────────────

function ipv4Parts(ip) {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

function ipv4Private(ip) {
  const p = ipv4Parts(ip);
  if (!p) return true;
  const [a, b, c] = p;
  return a === 0                                   // "this" network
    || a === 10                                    // private
    || (a === 100 && b >= 64 && b <= 127)          // carrier-grade NAT
    || a === 127                                   // loopback
    || (a === 169 && b === 254)                    // link-local (cloud metadata)
    || (a === 172 && b >= 16 && b <= 31)           // private
    || (a === 192 && b === 0 && c === 0)           // IETF protocol assignments
    || (a === 192 && b === 0 && c === 2)           // TEST-NET-1
    || (a === 192 && b === 88 && c === 99)         // 6to4 relay anycast
    || (a === 192 && b === 168)                    // private
    || (a === 198 && (b === 18 || b === 19))       // benchmarking
    || (a === 198 && b === 51 && c === 100)        // TEST-NET-2
    || (a === 203 && b === 0 && c === 113)         // TEST-NET-3
    || a >= 224;                                   // multicast, reserved, broadcast
}

/** Eight 16-bit groups of an IPv6 address (zone id dropped), or null. */
export function expandIPv6(ip) {
  let s = String(ip).split("%")[0].toLowerCase();
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = ipv4Parts(v4[2]);
    if (!p) return null;
    s = `${v4[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map(g => parseInt(g, 16));
}

function ipv6Private(ip) {
  const g = expandIPv6(ip);
  if (!g) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judged as IPv4.
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true;   // :: and ::1
    return ipv4Private(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  // Only global unicast (2000::/3) is public; everything else (ULA fc00::/7,
  // link-local fe80::/10, site-local, multicast ff00::/8, NAT64 64:ff9b::/96,
  // discard 100::/64, ...) is refused.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;           // 2001::/23 IETF (Teredo, ORCHID, ...)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;         // documentation
  if (g[0] === 0x2002) return true;                            // 6to4 (embeds an IPv4 address)
  if (g[0] === 0x3fff && g[1] < 0x1000) return true;           // documentation (3fff::/20)
  return false;
}

/** True for anything that is not a public unicast address (unparseable included). */
export function isPrivateAddress(ip) {
  const v = isIP(String(ip ?? "").split("%")[0]);
  if (v === 4) return ipv4Private(String(ip));
  if (v === 6) return ipv6Private(String(ip));
  return true;
}

// ── Providers ─────────────────────────────────────────────────────────────

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TYPES = ["track", "album", "playlist", "artist", "episode", "show"];
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_RESERVED = new Set([
  "home", "explore", "i", "search", "settings", "notifications", "messages", "intent", "share",
  "hashtag", "login", "logout", "signup", "tos", "privacy", "compose", "jobs", "about",
]);

function hostIs(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Which handler a URL goes to. Returns { provider, ...ids }. Anything not
 * recognized (a YouTube channel, an X search) is "generic" with `site` set,
 * so the page is read for Open Graph and the card keeps the site's name.
 */
export function detectProvider(url) {
  let u;
  try { u = new URL(url); } catch { return { provider: "generic" }; }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    if (YT_ID.test(parts[0] || "")) return { provider: "youtube", videoId: parts[0] };
    return { provider: "generic", site: "youtube" };
  }
  if (hostIs(host, "youtube.com") || hostIs(host, "youtube-nocookie.com")) {
    const v = u.searchParams.get("v");
    if (parts[0] === "watch" && YT_ID.test(v || "")) return { provider: "youtube", videoId: v };
    if (["shorts", "live", "embed", "v"].includes(parts[0]) && YT_ID.test(parts[1] || "")) {
      return { provider: "youtube", videoId: parts[1] };
    }
    return { provider: "generic", site: "youtube" };
  }

  if (host === "open.spotify.com") {
    const p = /^intl-[a-z-]+$/i.test(parts[0] || "") ? parts.slice(1) : parts;
    if (SPOTIFY_TYPES.includes(p[0]) && /^[A-Za-z0-9]{22}$/.test(p[1] || "")) {
      return { provider: "spotify", kind: p[0], id: p[1] };
    }
    return { provider: "generic", site: "spotify" };
  }

  if (["x.com", "twitter.com", "www.x.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com"].includes(host)) {
    if (parts[1] === "status" && /^\d{1,25}$/.test(parts[2] || "")) return { provider: "x", statusId: parts[2] };
    if (parts.length === 1 && X_HANDLE.test(parts[0]) && !X_RESERVED.has(parts[0].toLowerCase())) {
      return { provider: "x", handle: parts[0] };
    }
    return { provider: "generic", site: "x" };
  }

  if (host === "last.fm" || host === "www.last.fm") return { provider: "lastfm" };
  if (host === "instagram.com" || host === "www.instagram.com") return { provider: "instagram" };
  if (["t.me", "telegram.me", "telegram.dog"].includes(host)) return { provider: "telegram" };
  return { provider: "generic" };
}

/** A canonical watch URL for YouTube's oEmbed. */
export function youtubeOembedUrl(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/oembed?${new URLSearchParams({ url: watch, format: "json" })}`;
}

export function youtubeThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function spotifyOembedUrl(kind, id) {
  return `https://open.spotify.com/oembed?${new URLSearchParams({ url: `https://open.spotify.com/${kind}/${id}` })}`;
}

// ── HTML ──────────────────────────────────────────────────────────────────

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; } catch { return ""; }
    }
    return NAMED_ENTITIES[k] ?? all;
  });
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  const body = tag.replace(/^<\s*meta\b/i, "").replace(/\/?>$/, "");
  while ((m = re.exec(body)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/** The charset a <meta> declares in the first bytes of a page, or null. */
export function metaCharset(htmlStart) {
  const m = String(htmlStart).match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function headOf(html) {
  const text = String(html ?? "");
  const end = text.search(/<\/head\s*>/i);
  return end >= 0 ? text.slice(0, end) : text;
}

/**
 * Every <meta property|name=... content=...> of a page's <head> (the whole
 * text when there is no </head>): keys lowercased, first value per key,
 * entities decoded.
 */
export function parseMetaTags(html) {
  const meta = {};
  for (const tag of headOf(html).match(/<meta\b[^>]*>/gi) || []) {
    const a = parseAttributes(tag);
    const key = (a.property || a.name || "").toLowerCase().trim();
    if (!key || a.content == null) continue;
    if (!(key in meta)) meta[key] = decodeEntities(a.content);
  }
  return meta;
}

/**
 * Reads the tags a preview needs from a page's <head> (the whole text when
 * there is no </head>). Relative image URLs are resolved against `pageUrl`.
 */
export function parseOpenGraph(html, pageUrl) {
  const head = headOf(html);
  const meta = parseMetaTags(head);
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const pick = (...keys) => keys.map(k => meta[k]).find(v => typeof v === "string" && v.trim()) || null;
  const imageRaw = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  let image = null;
  if (imageRaw) {
    try { image = new URL(imageRaw.trim(), pageUrl).href; } catch { image = null; }
  }
  return {
    siteName: pick("og:site_name", "application-name"),
    title: pick("og:title", "twitter:title") || (titleTag ? decodeEntities(titleTag[1]) : null),
    description: pick("og:description", "twitter:description", "description"),
    image,
  };
}

// ── Extras: author, date, video, color ──────────────────────────────────────

/** "#abc" / "#AABBCC" -> "#aabbcc"; anything else (names, rgb(), url(...)) -> null. */
export function normalizeAccentColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + [...v.slice(1)].map(c => c + c).join("");
  return null;
}

const MIN_PUBLISHED_MS = Date.UTC(1995, 0, 1);

/** A publication date as ISO 8601, or null (unparseable, before 1995 or more than a day ahead). */
export function safePublishedAt(value, now = Date.now()) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const t = typeof value === "number" ? value : Date.parse(value.trim());
  if (!Number.isFinite(t) || t < MIN_PUBLISHED_MS || t > now + 24 * 60 * 60 * 1000) return null;
  return new Date(t).toISOString();
}

/** A person's or channel's name; null for URLs (article:author is often a profile link). */
export function authorName(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || /^(https?:)?\/\//i.test(v) || /^www\./i.test(v)) return null;
  return v;
}

/** What a page's <meta> tags add to a card besides title, description and image. */
export function pageExtras(meta) {
  const m = meta || {};
  const type = String(m["og:type"] || "").toLowerCase();
  return {
    author: authorName(m["author"]) || authorName(m["article:author"]) || null,
    publishedAt: safePublishedAt(m["article:published_time"] || m["og:published_time"] || null),
    video: !!(m["og:video"] || m["og:video:url"] || m["og:video:secure_url"]) || type.startsWith("video")
      || String(m["twitter:card"] || "").toLowerCase() === "player",
    color: normalizeAccentColor(m["theme-color"]),
  };
}

// ── Spotify ─────────────────────────────────────────────────────────────────

export const SPOTIFY_KINDS = { track: "Música", album: "Álbum", playlist: "Playlist", artist: "Artista", episode: "Episódio", show: "Podcast" };

/**
 * The artist and the line under it for a Spotify card, from the page's
 * <meta> tags (oEmbed gives the title and the cover, never the artist).
 *   track / album: author = music:musician_description, else the first part of
 *                  og:description ("Artista · Álbum · Música · 2019");
 *                  description = kind + year ("Música · 2019").
 *   episode:       description = kind + year.
 *   artist / playlist / show: no author; description = og:description
 *                  ("Artista · 1,2 mi ouvintes mensais"), else the kind.
 */
export function spotifyDetails(kind, meta) {
  const m = meta || {};
  const label = SPOTIFY_KINDS[kind] || null;
  const og = typeof m["og:description"] === "string" ? m["og:description"].trim() : "";
  const parts = og ? og.split(/\s+[·•]\s+/).map(p => p.trim()).filter(Boolean) : [];
  const year = /^(\d{4})/.exec(String(m["music:release_date"] || ""))?.[1] || null;
  if (kind === "track" || kind === "album") {
    const artist = authorName(m["music:musician_description"]) || (parts.length >= 3 ? authorName(parts[0]) : null);
    return { author: artist, description: [label, year].filter(Boolean).join(" · ") || null };
  }
  if (kind === "episode") {
    return { author: null, description: [label, year].filter(Boolean).join(" · ") || null };
  }
  return { author: null, description: og || label };
}

// ── Result ────────────────────────────────────────────────────────────────

/** One line of display text: control and invisible characters dropped, spaces collapsed, clipped. */
export function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const s = value
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return s.length > max ? `${clip(s, max - 1).trimEnd()}…` : s;
}

/**
 * Hosts a preview image may come from (the host itself or any subdomain).
 * Viewers' browsers load the image straight from its host, which sees their IP
 * address, so only hosts run by a big platform or a news organization are
 * allowed: nobody who posts a link can read their logs. An image anywhere else
 * is dropped and the card is text only. Never add a shared hosting or bucket
 * domain (storage.googleapis.com, *.s3.amazonaws.com, akamaihd.net, arc.pub,
 * wordpress.com, github.io, ...): anyone can serve files from those. A
 * server-side image proxy would lift the whole list; not built.
 */
export const PREVIEW_IMAGE_HOSTS = [
  // Video and streaming
  "ytimg.com", "ggpht.com", "static-cdn.jtvnw.net", "vimeocdn.com",
  // Music
  "scdn.co", "spotifycdn.com", "lastfm.freetls.fastly.net", "lastfm-img.freetls.fastly.net", "last.fm", "lst.fm",
  "mzstatic.com", "dzcdn.net", "sndcdn.com",
  // Social
  "pbs.twimg.com", "cdn.bsky.app", "redd.it", "redditmedia.com", "fbcdn.net", "cdninstagram.com",
  "tiktokcdn.com", "tiktokcdn-us.com",
  // Telegram
  "telesco.pe", "cdn-telegram.org", "telegram.org",
  // Images and chat
  "i.imgur.com", "cdn.discordapp.com", "media.discordapp.net",
  "lh3.googleusercontent.com", "lh4.googleusercontent.com", "lh5.googleusercontent.com", "lh6.googleusercontent.com",
  // Games
  "steamstatic.com", "media.rawg.io",
  // Reference and code
  "wikimedia.org", "githubassets.com", "avatars.githubusercontent.com", "repository-images.githubusercontent.com",
  "user-images.githubusercontent.com", "raw.githubusercontent.com", "miro.medium.com",
  // Film
  "m.media-amazon.com", "ltrbxd.com", "image.tmdb.org",
  // News: Brazil
  "glbimg.com", "imguol.com.br", "f.i.uol.com.br", "estadao.com.br", "cnnbrasil.com.br", "metroimg.com",
  "trrsf.com", "r7.com", "infomoney.com.br", "cartacapital.com.br", "abril.com.br", "brasildefato.com.br",
  "gazetadopovo.com.br", "poder360.com.br", "intercept.com.br", "correiobraziliense.com.br", "exame.com",
  "ebc.com.br", "nexojornal.com.br",
  // News: Portugal, Spain, Latin America
  "publico.pt", "rtp.pt", "elpais.com", "clarin.com", "lanacion.com.ar",
  // News: international
  "bbci.co.uk", "i.guim.co.uk", "nyt.com", "media.cnn.com", "reuters.com", "apnews.com", "washingtonpost.com",
  "aljazeera.com", "lemde.fr", "dw.com", "assets.bwbx.io", "theverge.com", "vox-cdn.com", "npr.org",
  "france24.com", "images.ft.com", "economist.com", "wsj.net", "politico.com", "axios.com", "cbsnewsstatic.com",
  "s-nbcnews.com", "abcnewsfe.com", "foxnews.com", "independent.co.uk", "telegraph.co.uk", "i.dailymail.co.uk",
  "365dm.com", "time.com", "techcrunch.com", "media.wired.com", "arstechnica.net", "euronews.com", "spiegel.de",
  "f1g.fr", "corriere.it",
];

/** True when `hostname` is one of PREVIEW_IMAGE_HOSTS or a subdomain of one. */
export function isPreviewImageHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return !!h && PREVIEW_IMAGE_HOSTS.some(k => h === k || h.endsWith(`.${k}`));
}

/**
 * An image URL a card may show: https, no credentials or port, at most 2048
 * characters, on an allowed host (isPreviewImageHost); otherwise null.
 */
export function safeImageUrl(value) {
  if (typeof value !== "string" || !value || value.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return isPreviewImageHost(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

export const PREVIEW_PROVIDERS = ["youtube", "spotify", "x", "lastfm", "instagram", "telegram", "generic"];

/** The normalized shape every preview has (null where a field is missing). */
export function previewResult({ url, siteName, title, author, description, image, provider, publishedAt, video, color }) {
  return {
    url,
    siteName: cleanText(siteName, 80),
    title: cleanText(title, 200),
    author: cleanText(authorName(author), 80),
    description: cleanText(description, 300),
    image: safeImageUrl(image),
    provider: PREVIEW_PROVIDERS.includes(provider) ? provider : "generic",
    publishedAt: safePublishedAt(publishedAt ?? null),
    video: video === true,
    color: normalizeAccentColor(color),
  };
}

/** The site name shown when a page gives none: the host without "www.". */
export function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return null; }
}

/** A generic page is worth a card only with a title or a description. */
export function hasContent(p) {
  return !!(p && (p.title || p.description));
}
