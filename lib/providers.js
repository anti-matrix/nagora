/**
 * lib/providers.js — I/O for external integrations: provider calls, the Redis
 * cache (keys under ngr:int:), the X refresh. Rules live in lib/integrations.js.
 *
 * API keys and the Last.fm shared secret are read here and never leave the
 * server (the Last.fm web-auth URL carries the public api_key by design).
 * Logs never contain a key, a token or a session key.
 */
import { query } from "./db.js";
import { kv, NS } from "./redis.js";
import {
  LASTFM_API, FXTWITTER_API, STEAM_OPENID, CACHE_KEEP_SECONDS, X_CODE_TTL_SECONDS,
  lastfmSignature, parseLastfmSession, parseLastfmRecent, parseSteamPlayer, parseSteamLastPlayed,
  steamCheckBody, steamCheckValid, parseFxProfile, pickLastOriginalPost, summarizePost,
  isCacheFresh, nextCheckAt,
} from "./integrations.js";

const FETCH_TIMEOUT_MS = 5000;
const FX_TIMEOUT_MS = 3000;
const FX_RETRIES = 3;          // FxTwitter returns random 404s: retried up to 3 times
const FX_RETRY_DELAY_MS = 250;
const USER_AGENT = "NAGORA (+https://etanagora.vercel.app)";

export const INT_PREFIX = `${NS}int:`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, { timeoutMs = FETCH_TIMEOUT_MS, method = "GET", body, headers = {} } = {}) {
  const r = await fetch(url, {
    method,
    body,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, ok: r.ok, json, text };
}

// ── Last.fm ───────────────────────────────────────────────────────────────

/** Exchanges a web-auth token for a session and returns only the username. */
export async function lastfmSessionName(token) {
  const params = { method: "auth.getSession", api_key: process.env.LASTFM_API_KEY, token };
  params.api_sig = lastfmSignature(params, process.env.LASTFM_SHARED_SECRET);
  const url = `${LASTFM_API}?${new URLSearchParams({ ...params, format: "json" })}`;
  const r = await getJson(url);
  // The session key in r.json.session.key is never read, stored or logged.
  return parseLastfmSession(r.json).name;
}

export async function lastfmRecentTrack(name) {
  const url = `${LASTFM_API}?${new URLSearchParams({
    method: "user.getrecenttracks", user: name, api_key: process.env.LASTFM_API_KEY, format: "json", limit: "1",
  })}`;
  const r = await getJson(url);
  if (!r.json) throw new ProviderError(`Last.fm responded ${r.status}`, r.status);
  return parseLastfmRecent(r.json);
}

// ── Steam ─────────────────────────────────────────────────────────────────

/** Asks Steam to confirm an OpenID assertion (check_authentication). */
export async function steamAssertionValid(queryParams) {
  const r = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: steamCheckBody(queryParams).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return r.ok && steamCheckValid(await r.text());
}

export async function steamPlayer(steamId) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${new URLSearchParams({
    key: process.env.STEAM_API_KEY, steamids: steamId,
  })}`;
  const r = await getJson(url);
  if (!r.ok || !r.json) throw new ProviderError(`Steam responded ${r.status}`, r.status);
  return parseSteamPlayer(r.json);
}

/** The last played game (GetOwnedGames), or null when there is none or the library is private. */
export async function steamLastPlayed(steamId) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${new URLSearchParams({
    key: process.env.STEAM_API_KEY, steamid: steamId, include_appinfo: "1", include_played_free_games: "1", format: "json",
  })}`;
  const r = await getJson(url);
  if (!r.ok || !r.json) throw new ProviderError(`Steam responded ${r.status}`, r.status);
  return parseSteamLastPlayed(r.json);
}

// ── X through FxTwitter ───────────────────────────────────────────────────

/** GET with up to FX_RETRIES retries on 404 / 5xx / network errors. */
async function fxGet(path) {
  let last = null;
  for (let attempt = 0; attempt <= FX_RETRIES; attempt++) {
    if (attempt) await sleep(FX_RETRY_DELAY_MS * attempt);
    try {
      const r = await getJson(`${FXTWITTER_API}${path}`, { timeoutMs: FX_TIMEOUT_MS });
      if (r.ok && r.json) return r.json;
      last = new ProviderError(`FxTwitter responded ${r.status}`, r.status);
      if (r.status !== 404 && r.status < 500) break;
    } catch (err) {
      last = err;
    }
  }
  throw last || new ProviderError("FxTwitter failed");
}

export async function xProfile(handle) {
  return parseFxProfile(await fxGet(`/profile/${encodeURIComponent(handle)}`));
}

/** The stored shape of the last original post, or null when there is none in the page. */
export async function xLastPost(handle) {
  const json = await fxGet(`/profile/${encodeURIComponent(handle)}/statuses?count=40`);
  return summarizePost(pickLastOriginalPost(json?.results, handle));
}

/**
 * Stores the result of one X check. Success: last_post (kept when the page had
 * no original post), last_checked_at, next_check_at = +1 h. Failure: the stored
 * post stays, next_check_at = +10 min. Guarded by external_id against a relink.
 */
export async function recordXCheck(userId, handle, { ok, post }) {
  if (ok) {
    await query(
      `UPDATE account_integrations
       SET last_post = COALESCE($3::jsonb, last_post), last_checked_at = now(), next_check_at = $4
       WHERE user_id = $1 AND provider = 'x' AND external_id = $2`,
      [userId, handle, post ? JSON.stringify(post) : null, nextCheckAt(true)]
    );
  } else {
    await query(
      "UPDATE account_integrations SET next_check_at = $3 WHERE user_id = $1 AND provider = 'x' AND external_id = $2",
      [userId, handle, nextCheckAt(false)]
    );
  }
}

/** One check now (link time). Returns { ok, post }. Never throws. */
export async function checkXNow(userId, handle) {
  let result;
  try {
    result = { ok: true, post: await xLastPost(handle) };
  } catch (err) {
    console.error("[x-refresh] check failed:", err?.message || err);
    result = { ok: false, post: null };
  }
  try {
    await recordXCheck(userId, handle, result);
  } catch (err) {
    console.error("[x-refresh] store failed:", err?.message || err);
  }
  return result;
}

/**
 * Called by the owner's own login and heartbeat, never by a viewer. Claims the
 * check atomically (next_check_at pushed 10 minutes ahead in the same UPDATE
 * that tests it), so two simultaneous requests cannot both call FxTwitter.
 * Never throws: it runs after the response.
 */
export async function refreshXIfDue(userId) {
  if (!userId) return;
  try {
    const { rows } = await query(
      `UPDATE account_integrations
       SET next_check_at = now() + interval '10 minutes'
       WHERE user_id = $1 AND provider = 'x' AND (next_check_at IS NULL OR next_check_at <= now())
       RETURNING external_id`,
      [userId]
    );
    if (!rows.length) return;
    const { ok } = await checkXNow(userId, rows[0].external_id);
    console.log(`[x-refresh] scheduled check ${ok ? "ok" : "failed"}`);
  } catch (err) {
    console.error("[x-refresh]", err?.message || err);
  }
}

// ── Database ──────────────────────────────────────────────────────────────

export class AlreadyLinkedError extends Error {}

/**
 * Links (or relinks) one provider for an account. Linking a different external
 * account resets the X post and its schedule. The unique index on
 * (provider, lower(external_id)) refuses an account linked by someone else.
 */
export async function linkIntegration(userId, provider, externalId, displayName) {
  try {
    const { rows } = await query(
      `INSERT INTO account_integrations (user_id, provider, external_id, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         external_id = EXCLUDED.external_id,
         display_name = EXCLUDED.display_name,
         verified_at = now(),
         last_post = CASE WHEN lower(account_integrations.external_id) = lower(EXCLUDED.external_id)
                          THEN account_integrations.last_post END,
         last_checked_at = CASE WHEN lower(account_integrations.external_id) = lower(EXCLUDED.external_id)
                                THEN account_integrations.last_checked_at END,
         next_check_at = NULL
       RETURNING provider, external_id, display_name, verified_at`,
      [userId, provider, externalId, displayName || null]
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") throw new AlreadyLinkedError("already linked");
    throw err;
  }
}

/** Whether another NAGORA account already linked this external account. */
export async function linkedElsewhere(provider, externalId, userId) {
  const { rows } = await query(
    "SELECT 1 FROM account_integrations WHERE provider = $1 AND lower(external_id) = lower($2) AND user_id <> $3",
    [provider, externalId, userId]
  );
  return rows.length > 0;
}

// ── Redis: cache, state nonces, X codes ───────────────────────────────────

function cacheKey(provider, userId, externalId) {
  return `${INT_PREFIX}${provider}:${userId}:${String(externalId).toLowerCase()}`;
}

/**
 * Cached activity for Last.fm / Steam: fresh value, else a new fetch, else the
 * last value with its age ({ stale: true }). Throws only when nothing is cached
 * and the provider fails. A Redis outage just means no cache.
 */
export async function cachedActivity(provider, userId, externalId, fetcher, now = Date.now()) {
  const key = cacheKey(provider, userId, externalId);
  let entry = null;
  try { entry = await kv.get(key); } catch (err) { console.error("[int-cache] read failed:", err?.message || err); }
  if (isCacheFresh(entry, provider, now)) return { data: entry.v, at: entry.at, stale: false };

  try {
    const data = await fetcher();
    const at = Date.now();
    try { await kv.set(key, { v: data, at }, { ex: CACHE_KEEP_SECONDS }); } catch (err) {
      console.error("[int-cache] write failed:", err?.message || err);
    }
    return { data, at, stale: false };
  } catch (err) {
    console.error(`[int-cache] ${provider} fetch failed:`, err?.message || err);
    if (entry && Number.isFinite(entry.at)) return { data: entry.v, at: entry.at, stale: true };
    throw err;
  }
}

export async function dropCachedActivity(provider, userId, externalId) {
  try { await kv.del(cacheKey(provider, userId, externalId)); } catch { /* expires on its own */ }
}

/** A link-state nonce can be spent once. Fails open (logged) if Redis is down. */
export async function spendStateNonce(nonce) {
  try {
    return !!(await kv.set(`${INT_PREFIX}state:${nonce}`, 1, { nx: true, ex: 15 * 60 }));
  } catch (err) {
    console.error("[int-state] nonce check failed, allowing:", err?.message || err);
    return true;
  }
}

const xCodeKey = (userId) => `${INT_PREFIX}xcode:${userId}`;

export async function saveXCode(userId, handle, code) {
  await kv.set(xCodeKey(userId), { handle, code }, { ex: X_CODE_TTL_SECONDS });
}

export async function readXCode(userId) {
  const v = await kv.get(xCodeKey(userId));
  return v && typeof v.code === "string" && typeof v.handle === "string" ? v : null;
}

export async function clearXCode(userId) {
  try { await kv.del(xCodeKey(userId)); } catch { /* expires on its own */ }
}

export async function xCodeTtl(userId) {
  try { return Math.max(0, Number(await kv.ttl(xCodeKey(userId))) || 0); } catch { return 0; }
}
