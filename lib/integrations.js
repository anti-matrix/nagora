/**
 * lib/integrations.js — external integrations (Last.fm, Steam, X): pure rules.
 * No database, no Redis, no fetch. The I/O lives in lib/providers.js.
 *
 * Spotify is not integrated on purpose: its development mode is capped at
 * 5 users and extended quota needs a company. Spotify listening reaches
 * NAGORA through Last.fm scrobbling instead.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PROVIDERS = ["lastfm", "steam", "x"];
export const VISIBILITIES = ["everyone", "friends", "nobody"];

/**
 * Whether the server has what a provider needs. Last.fm and Steam also need
 * INTEGRATION_STATE_SECRET (it signs their link state); X needs no variable.
 */
export function providerAvailable(provider, env = process.env) {
  const state = !!String(env.INTEGRATION_STATE_SECRET ?? "").trim();
  if (provider === "lastfm") return !!(env.LASTFM_API_KEY && env.LASTFM_SHARED_SECRET && state);
  if (provider === "steam") return !!(env.STEAM_API_KEY && state);
  return provider === "x";
}

export function normalizeProvider(input) {
  return PROVIDERS.includes(input) ? input : null;
}

export function normalizeVisibility(input) {
  return VISIBILITIES.includes(input) ? input : null;
}

/** 'everyone' for any logged-in viewer, 'friends' for accepted friends, 'nobody' never; the owner always. */
export function canViewIntegration(visibility, { isSelf = false, isFriend = false } = {}) {
  if (isSelf) return true;
  if (visibility === "everyone") return true;
  if (visibility === "friends") return !!isFriend;
  return false;
}

// ── Cache (Last.fm / Steam, on demand) ────────────────────────────────────

export const CACHE_TTL_MS = { lastfm: 30 * 1000, steam: 60 * 1000 };
/** How long a stale value is kept to be served when the provider fails. */
export const CACHE_KEEP_SECONDS = 24 * 60 * 60;

export function cacheTtlMs(provider) {
  return CACHE_TTL_MS[provider] ?? 0;
}

/** An entry { at } is fresh while younger than the provider's TTL. */
export function isCacheFresh(entry, provider, now = Date.now()) {
  return !!entry && Number.isFinite(entry.at) && now - entry.at < cacheTtlMs(provider);
}

// ── X refresh schedule ────────────────────────────────────────────────────

export const X_CHECK_OK_MS = 60 * 60 * 1000;
export const X_CHECK_FAIL_MS = 10 * 60 * 1000;

/** next_check_at after a check: +1 hour on success, +10 minutes on failure. */
export function nextCheckAt(ok, now = Date.now()) {
  return new Date(now + (ok ? X_CHECK_OK_MS : X_CHECK_FAIL_MS));
}

// ── Signed link state (Last.fm / Steam callbacks) ─────────────────────────
// Same HMAC pattern as the client token (lib/handshake.js), keyed by its own
// secret INTEGRATION_STATE_SECRET, used for nothing else. The state also binds
// the user and the provider, and its nonce is spent once (Redis) by the callback.

export const STATE_TTL_MS = 10 * 60 * 1000;

/** The HMAC key: INTEGRATION_STATE_SECRET as given. Throws when it is missing or empty. */
export function stateKey(secret) {
  const value = String(secret ?? "").trim();
  if (!value) throw new Error("INTEGRATION_STATE_SECRET env var is required");
  return Buffer.from(value, "utf8");
}

function stateSig(key, payloadPart) {
  return createHmac("sha256", key).update(payloadPart).digest();
}

export function signState(key, { userId, provider, nonce, now = Date.now(), ttlMs = STATE_TTL_MS }) {
  const payloadPart = Buffer.from(JSON.stringify({ u: userId, p: provider, n: nonce, exp: now + ttlMs })).toString("base64url");
  return `${payloadPart}.${stateSig(key, payloadPart).toString("base64url")}`;
}

/** { ok: true, nonce } or { ok: false, reason: "malformed" | "signature" | "expired" | "mismatch" }. */
export function verifyState(key, token, { userId, provider, now = Date.now() }) {
  if (typeof token !== "string" || token.split(".").length !== 2) return { ok: false, reason: "malformed" };
  const [payloadPart, sigPart] = token.split(".");
  const expected = stateSig(key, payloadPart);
  const actual = Buffer.from(sigPart, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, reason: "signature" };
  let p;
  try {
    p = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!p || typeof p.exp !== "number" || typeof p.n !== "string") return { ok: false, reason: "malformed" };
  if (now >= p.exp) return { ok: false, reason: "expired" };
  if (p.u !== userId || p.p !== provider) return { ok: false, reason: "mismatch" };
  return { ok: true, nonce: p.n };
}

/** At most n characters, never splitting a surrogate pair (emoji). */
export function clip(value, n) {
  const s = String(value ?? "");
  if (s.length <= n) return s;
  return Array.from(s).slice(0, n).join("");
}

// ── URLs from providers ───────────────────────────────────────────────────

/** The URL when it is https on one of `hosts` (exact or subdomain), else null. */
export function safeHttpsUrl(value, hosts) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    const ok = hosts.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
    return ok ? u.href : null;
  } catch {
    return null;
  }
}

// ── Last.fm ───────────────────────────────────────────────────────────────

export const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
export const LASTFM_AUTH = "https://www.last.fm/api/auth/";
const LASTFM_IMAGE_HOSTS = ["lastfm.freetls.fastly.net", "last.fm", "lst.fm"];
// Last.fm's grey star placeholder for tracks without art.
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

/** api_sig: params sorted by name, name+value concatenated (format/callback excluded), secret appended, MD5. */
export function lastfmSignature(params, secret) {
  const base = Object.keys(params)
    .filter(k => k !== "format" && k !== "callback")
    .sort()
    .map(k => `${k}${params[k]}`)
    .join("");
  return createHash("md5").update(base + secret, "utf8").digest("hex");
}

export function lastfmAuthUrl(apiKey) {
  return `${LASTFM_AUTH}?api_key=${encodeURIComponent(apiKey)}`;
}

/** auth.getSession JSON → { name }. The session key is read by nobody and dropped. */
export function parseLastfmSession(json) {
  if (json?.error) throw new Error(`Last.fm error ${json.error}`);
  const name = json?.session?.name;
  if (typeof name !== "string" || !name.trim()) throw new Error("Last.fm session without a name");
  return { name: name.trim() };
}

function lastfmText(v) {
  if (typeof v === "string") return v;
  if (v && typeof v["#text"] === "string") return v["#text"];
  if (v && typeof v.name === "string") return v.name;
  return "";
}

/**
 * user.getRecentTracks JSON (limit=1) → the now-playing or last played track:
 * { nowPlaying, title, artist, album, imageUrl, playedAt, url }, or null when
 * the user never scrobbled. Throws on a Last.fm error (e.g. 17: private).
 */
export function parseLastfmRecent(json) {
  if (json?.error) {
    const err = new Error(`Last.fm error ${json.error}`);
    err.code = json.error;
    throw err;
  }
  const raw = json?.recenttracks?.track;
  const tracks = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const t = tracks.find(x => x?.["@attr"]?.nowplaying === "true") || tracks[0];
  if (!t) return null;
  const images = Array.isArray(t.image) ? t.image : [];
  const bySize = (s) => images.find(i => i?.size === s && i["#text"])?.["#text"];
  let imageUrl = bySize("extralarge") || bySize("large") || bySize("medium") || null;
  if (imageUrl && imageUrl.includes(LASTFM_PLACEHOLDER)) imageUrl = null;
  const uts = Number(t.date?.uts);
  return {
    nowPlaying: t["@attr"]?.nowplaying === "true",
    title: clip(lastfmText(t.name), 300),
    artist: clip(lastfmText(t.artist), 300),
    album: clip(lastfmText(t.album), 300) || null,
    imageUrl: safeHttpsUrl(imageUrl, LASTFM_IMAGE_HOSTS),
    playedAt: Number.isFinite(uts) && uts > 0 ? new Date(uts * 1000).toISOString() : null,
    url: safeHttpsUrl(t.url, ["last.fm"]),
  };
}

// ── Steam ─────────────────────────────────────────────────────────────────

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const STEAM_CLAIMED_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const STEAM_IMAGE_HOSTS = ["steamstatic.com", "steamcommunity.com", "steampowered.com"];
export const STEAM_STATES = ["offline", "online", "busy", "away", "snooze", "trade", "play"];

export function steamLoginUrl(origin) {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": `${origin}/api/steam-callback`,
    "openid.realm": origin,
    "openid.identity": OPENID_SELECT,
    "openid.claimed_id": OPENID_SELECT,
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * Checks the shape of a positive assertion before asking Steam to confirm it:
 * mode id_res, our return_to, Steam's endpoint, a SteamID64 claimed_id.
 * Returns { steamId } or { error }.
 */
export function readSteamAssertion(query, origin) {
  const q = query || {};
  if (q["openid.mode"] !== "id_res") return { error: q["openid.mode"] === "cancel" ? "denied" : "failed" };
  if (q["openid.op_endpoint"] !== STEAM_OPENID) return { error: "failed" };
  const returnTo = String(q["openid.return_to"] || "");
  if (returnTo.split("?")[0] !== `${origin}/api/steam-callback`) return { error: "failed" };
  const claimed = String(q["openid.claimed_id"] || "");
  const m = claimed.match(STEAM_CLAIMED_RE);
  if (!m || q["openid.identity"] !== claimed) return { error: "failed" };
  return { steamId: m[1] };
}

/** Form body for check_authentication: every openid.* field, mode replaced. */
export function steamCheckBody(query) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (k.startsWith("openid.") && typeof v === "string") body.set(k, v);
  }
  body.set("openid.mode", "check_authentication");
  return body;
}

/** Steam answers key:value lines; only "is_valid:true" proves the assertion. */
export function steamCheckValid(text) {
  return String(text || "").split("\n").some(line => line.trim() === "is_valid:true");
}

/** GetPlayerSummaries v2 JSON → { personaName, state, isPublic, game, avatarUrl, profileUrl } or null. */
export function parseSteamPlayer(json) {
  const p = json?.response?.players?.[0];
  if (!p) return null;
  const isPublic = Number(p.communityvisibilitystate) === 3;
  const gameId = typeof p.gameid === "string" && /^\d{1,10}$/.test(p.gameid) ? p.gameid : null;
  const gameName = typeof p.gameextrainfo === "string" ? clip(p.gameextrainfo, 200) : null;
  return {
    personaName: typeof p.personaname === "string" ? clip(p.personaname, 100) : null,
    state: STEAM_STATES[Number(p.personastate)] || "offline",
    isPublic,
    game: gameName ? {
      name: gameName,
      id: gameId,
      capsuleUrl: gameId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/capsule_184x69.jpg` : null,
    } : null,
    avatarUrl: safeHttpsUrl(p.avatarfull, STEAM_IMAGE_HOSTS),
    profileUrl: safeHttpsUrl(p.profileurl, ["steamcommunity.com"]),
  };
}

// ── X (through FxTwitter, no key) ─────────────────────────────────────────

export const FXTWITTER_API = "https://api.fxtwitter.com/2";
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const X_POST_HOSTS = ["x.com", "twitter.com"];
const X_MEDIA_HOSTS = ["pbs.twimg.com"];
export const X_CODE_TTL_SECONDS = 15 * 60;
const X_CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** "@Name", "name", "https://x.com/Name" → "Name"; null when not a valid handle. */
export function normalizeXHandle(input) {
  let v = String(input ?? "").trim();
  const url = v.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@+/, "");
  return X_HANDLE_RE.test(v) ? v : null;
}

/** "nagora-7f3k2". `randomInt(n)` is injected (crypto.randomInt in production). */
export function makeXCode(randomInt) {
  let s = "";
  for (let i = 0; i < 5; i++) s += X_CODE_ALPHABET[randomInt(X_CODE_ALPHABET.length)];
  return `nagora-${s}`;
}

export function bioHasCode(bio, code) {
  if (typeof bio !== "string" || typeof code !== "string" || !code) return false;
  return bio.toLowerCase().includes(code.toLowerCase());
}

/** /2/profile/{handle} JSON → { screenName, name, description } or null (unknown / suspended). */
export function parseFxProfile(json) {
  const u = json?.user;
  if (!u || typeof u.screen_name !== "string") return null;
  return {
    screenName: u.screen_name,
    name: typeof u.name === "string" ? clip(u.name, 100) : null,
    description: typeof u.description === "string" ? u.description : "",
  };
}

function statusTime(s) {
  const ts = Number(s?.created_timestamp);
  if (Number.isFinite(ts) && ts > 0) return ts * 1000;
  const parsed = Date.parse(s?.created_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Written by `handle` itself: not a repost of someone else's post. */
function isOwnPost(s, handle) {
  const author = s?.author?.screen_name;
  return !s?.reposted_by && typeof author === "string" && author.toLowerCase() === handle.toLowerCase();
}

/**
 * The single most recent ORIGINAL post in a /statuses page: retweets
 * (reposted_by set, or another author) and replies (replying_to set) are
 * skipped; quote posts count. FxTwitter does not mark a pinned post, so the
 * first result is treated as pinned when it is older than a later original
 * (X lists the pinned post first). The newest remaining original wins.
 */
export function pickLastOriginalPost(results, handle) {
  const list = (Array.isArray(results) ? results : []).filter(s => s && s.type !== "thread");
  const originals = list.filter(s => isOwnPost(s, handle) && !s.replying_to);
  if (!originals.length) return null;
  let candidates = originals;
  if (list[0] === originals[0] && originals.slice(1).some(s => statusTime(s) > statusTime(originals[0]))) {
    candidates = originals.slice(1);
  }
  return candidates.reduce((best, s) => (statusTime(s) > statusTime(best) ? s : best));
}

function mediaThumbs(media) {
  const out = [];
  for (const p of media?.photos || []) {
    const url = safeHttpsUrl(p?.url, X_MEDIA_HOSTS);
    if (url) out.push(url.replace(/([?&])name=orig\b/, "$1name=small"));
  }
  for (const v of media?.videos || []) {
    const url = safeHttpsUrl(v?.thumbnail_url, X_MEDIA_HOSTS);
    if (url) out.push(url);
  }
  return out.slice(0, 4);
}

/** What last_post stores: { id, text, createdAt, url, quote, media }. */
export function summarizePost(s) {
  if (!s) return null;
  const q = s.quote && typeof s.quote.text === "string" ? s.quote : null;
  return {
    id: String(s.id),
    text: clip(s.text, 1000),
    createdAt: new Date(statusTime(s)).toISOString(),
    url: safeHttpsUrl(s.url, X_POST_HOSTS),
    quote: q ? {
      author: typeof q.author?.screen_name === "string" ? q.author.screen_name : null,
      text: clip(q.text, 300),
      url: safeHttpsUrl(q.url, X_POST_HOSTS),
    } : null,
    media: mediaThumbs(s.media),
  };
}
