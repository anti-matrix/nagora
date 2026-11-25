/**
 * lib/previewfetch.js — link previews: the I/O (page and provider fetches,
 * the Redis cache under ngr:lp:). Rules live in lib/linkpreview.js.
 *
 * Page fetches (fetchPage):
 *   - http/https only, default ports, at most 3 redirects, each hop re-checked;
 *   - every address a hostname resolves to must be public: the check runs in
 *     the socket's own `lookup`, so the address checked is the address used
 *     (no window for DNS rebinding); literal IPs are checked before connecting;
 *   - 5 s for the whole chain, at most 512 KB read (after decompression),
 *     only text/html / application/xhtml+xml parsed;
 *   - no cookies, no NAGORA header: User-Agent, Accept, Accept-Language,
 *     Accept-Encoding only.
 * Logs carry the provider and an error code, never the URL.
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import { isIP } from "node:net";
import { kv, NS } from "./redis.js";
import {
  PREVIEW_TTL_SECONDS, PREVIEW_FAIL_TTL_SECONDS, PREVIEW_TIMEOUT_MS, PREVIEW_MAX_BYTES,
  PREVIEW_MAX_REDIRECTS, PREVIEW_USER_AGENT,
  normalizePreviewUrl, isPrivateAddress, previewCacheId, detectProvider,
  youtubeOembedUrl, youtubeThumbnail, spotifyOembedUrl,
  parseOpenGraph, metaCharset, previewResult, hostLabel, hasContent,
} from "./linkpreview.js";
import { fxGet } from "./providers.js";
import { mediaThumbs, safeHttpsUrl } from "./integrations.js";

export const LP_PREFIX = `${NS}lp:`;

export class PreviewBlockedError extends Error {
  constructor(message = "blocked address") {
    super(message);
    this.code = "BLOCKED";
  }
}

// ── Guarded page fetch ────────────────────────────────────────────────────

/** dns.lookup that refuses a hostname when ANY of its addresses is not public. */
export function guardedLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length || list.some(a => isPrivateAddress(a.address))) return callback(new PreviewBlockedError());
    if (options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function bareHost(u) {
  return u.hostname.replace(/^\[|\]$/g, "");
}

const HTML_TYPES = ["text/html", "application/xhtml+xml"];
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** One GET. Resolves with the response (body not read yet). */
function requestOnce(url, signal) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const host = bareHost(u);
    // net.connect never calls `lookup` for a literal IP: check it here.
    if (isIP(host) && isPrivateAddress(host)) return reject(new PreviewBlockedError());
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET",
      agent: false,              // a fresh connection: every hop goes through guardedLookup
      lookup: guardedLookup,
      signal,
      headers: {
        "User-Agent": PREVIEW_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
    }, resolve);
    req.on("error", reject);
    req.end();
  });
}

function decoderFor(res) {
  const enc = String(res.headers["content-encoding"] || "").trim().toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return zlib.createGunzip();
  if (enc === "deflate") return zlib.createInflate();
  if (enc === "br") return zlib.createBrotliDecompress();
  return null;
}

/** At most `max` bytes of the (decompressed) body; the rest is never read. */
function readCapped(res, max) {
  return new Promise((resolve, reject) => {
    const decoder = decoderFor(res);
    const stream = decoder ? res.pipe(decoder) : res;
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      res.destroy();
      if (decoder) decoder.destroy();
      resolve(Buffer.concat(chunks, Math.min(size, max)).subarray(0, max));
    };
    stream.on("data", (chunk) => {
      if (done) return;
      chunks.push(chunk);
      size += chunk.length;
      if (size >= max) finish();
    });
    stream.on("end", finish);
    stream.on("error", (err) => {
      if (done) return;
      // A body cut short still gives its first bytes (the <head> is all we need).
      if (size > 0) return finish();
      done = true;
      res.destroy();
      reject(err);
    });
  });
}

function decodeBody(buf, contentType) {
  const fromHeader = String(contentType || "").match(/charset\s*=\s*"?([A-Za-z0-9_-]+)/i)?.[1];
  const label = (fromHeader || metaCharset(buf.subarray(0, 2048).toString("latin1")) || "utf-8").toLowerCase();
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/**
 * Fetches an HTML page under every rule above. Returns { html, finalUrl }.
 * Throws PreviewBlockedError for a private address, Error otherwise.
 */
export async function fetchPage(startUrl, { timeoutMs = PREVIEW_TIMEOUT_MS, maxBytes = PREVIEW_MAX_BYTES } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = normalizePreviewUrl(startUrl);
  if (!url) throw new Error("invalid url");
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, signal);
    if (REDIRECTS.has(res.statusCode)) {
      res.resume();
      if (hop >= PREVIEW_MAX_REDIRECTS) throw new Error("too many redirects");
      let next = null;
      try { next = normalizePreviewUrl(new URL(String(res.headers.location || ""), url).href); } catch { next = null; }
      if (!next) throw new Error("bad redirect");
      url = next;
      continue;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      throw new Error(`status ${res.statusCode}`);
    }
    const type = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!HTML_TYPES.includes(type)) {
      res.destroy();
      throw new Error("not html");
    }
    const body = await readCapped(res, maxBytes);
    return { html: decodeBody(body, res.headers["content-type"]), finalUrl: url };
  }
}

// ── Providers ─────────────────────────────────────────────────────────────

/** JSON from a fixed provider host (YouTube / Spotify oEmbed). Null on any failure. */
async function oembed(endpoint) {
  try {
    const r = await fetch(endpoint, {
      headers: { "User-Agent": PREVIEW_USER_AGENT, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const json = await r.json();
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

async function youtubePreview(url, { videoId }) {
  const j = await oembed(youtubeOembedUrl(videoId));
  if (!j || typeof j.title !== "string") return null;
  return previewResult({
    url,
    siteName: "YouTube",
    title: j.title,
    description: typeof j.author_name === "string" ? j.author_name : null,
    image: safeHttpsUrl(j.thumbnail_url, ["ytimg.com"]) || youtubeThumbnail(videoId),
    provider: "youtube",
  });
}

const SPOTIFY_KINDS = { track: "Música", album: "Álbum", playlist: "Playlist", artist: "Artista", episode: "Episódio", show: "Podcast" };

async function spotifyPreview(url, { kind, id }) {
  const j = await oembed(spotifyOembedUrl(kind, id));
  if (!j || typeof j.title !== "string") return null;
  return previewResult({
    url,
    siteName: "Spotify",
    title: j.title,
    description: SPOTIFY_KINDS[kind] || null,
    image: safeHttpsUrl(j.thumbnail_url, ["scdn.co", "spotifycdn.com"]),
    provider: "spotify",
  });
}

const X_IMAGE_HOSTS = ["pbs.twimg.com"];

async function xPreview(url, d) {
  if (d.statusId) {
    const j = await fxGet(`/status/${d.statusId}`);
    const s = j?.status;
    if (!s || typeof s.text !== "string") return null;
    const a = s.author || {};
    return previewResult({
      url,
      siteName: "X",
      title: a.name && a.screen_name ? `${a.name} (@${a.screen_name})` : (a.screen_name ? `@${a.screen_name}` : null),
      description: s.text || (s.quote?.text ?? null),
      image: mediaThumbs(s.media)[0] || safeHttpsUrl(a.avatar_url, X_IMAGE_HOSTS),
      provider: "x",
    });
  }
  const j = await fxGet(`/profile/${encodeURIComponent(d.handle)}`);
  const u = j?.user;
  if (!u || typeof u.screen_name !== "string") return null;
  return previewResult({
    url,
    siteName: "X",
    title: u.name ? `${u.name} (@${u.screen_name})` : `@${u.screen_name}`,
    description: typeof u.description === "string" ? u.description : null,
    image: safeHttpsUrl(u.avatar_url, X_IMAGE_HOSTS),
    provider: "x",
  });
}

async function openGraphPreview(url, provider, siteName) {
  const { html, finalUrl } = await fetchPage(url);
  const og = parseOpenGraph(html, finalUrl);
  const p = previewResult({
    url,
    siteName: og.siteName || siteName || hostLabel(finalUrl),
    title: og.title,
    description: og.description,
    image: og.image,
    provider,
  });
  return hasContent(p) ? p : null;
}

const SITE_NAMES = { youtube: "YouTube", spotify: "Spotify", x: "X", lastfm: "Last.fm", instagram: "Instagram", telegram: "Telegram" };

/**
 * The preview of a normalized URL and how long to keep it:
 * { preview, ttl } with preview null when there is nothing to show.
 * Never throws.
 */
export async function computePreview(url) {
  const d = detectProvider(url);
  const ok = (preview) => ({ preview, ttl: PREVIEW_TTL_SECONDS });
  const none = { preview: null, ttl: PREVIEW_FAIL_TTL_SECONDS };
  try {
    if (d.provider === "youtube") {
      const p = await youtubePreview(url, d);
      if (p) return ok(p);
    } else if (d.provider === "spotify") {
      const p = await spotifyPreview(url, d);
      if (p) return ok(p);
    } else if (d.provider === "x") {
      // X pages carry no tags for crawlers: FxTwitter or nothing.
      const p = await xPreview(url, d).catch(() => null);
      return p ? ok(p) : none;
    }
  } catch (err) {
    console.error(`[link-preview] ${d.provider} failed:`, err?.code || err?.name || "error");
  }

  const provider = d.provider === "generic" && d.site ? d.site : d.provider;
  try {
    const p = await openGraphPreview(url, provider, SITE_NAMES[provider]);
    // Instagram's crawler page has only <title>Instagram</title>: not a real preview.
    if (p && (d.provider !== "instagram" || p.description || p.image)) return ok(p);
  } catch (err) {
    if (!(err instanceof PreviewBlockedError)) {
      console.error(`[link-preview] ${provider} page failed:`, err?.code || err?.message || "error");
    }
  }
  // Instagram blocks crawlers: one try, then a minimal card (name and link), kept for an hour.
  if (d.provider === "instagram") {
    return { preview: previewResult({ url, siteName: "Instagram", provider: "instagram" }), ttl: PREVIEW_FAIL_TTL_SECONDS };
  }
  return none;
}

// ── Cache ─────────────────────────────────────────────────────────────────

function cacheKey(url) {
  return `${LP_PREFIX}${previewCacheId(url)}`;
}

/** { hit: true, preview } from Redis, or { hit: false }. A Redis outage is a miss. */
export async function readCachedPreview(url) {
  try {
    const entry = await kv.get(cacheKey(url));
    if (entry && typeof entry === "object" && "p" in entry) return { hit: true, preview: entry.p };
  } catch (err) {
    console.error("[link-preview] cache read failed:", err?.message || err);
  }
  return { hit: false };
}

export async function writeCachedPreview(url, preview, ttl) {
  try {
    await kv.set(cacheKey(url), { p: preview }, { ex: ttl });
  } catch (err) {
    console.error("[link-preview] cache write failed:", err?.message || err);
  }
}
