/**
 * /api/integrations — Last.fm, Steam and X links and the activity they show.
 *
 *   GET  ?type=mine                         the caller's links, availability, a pending X code
 *   GET  ?type=activity&userId=             a user's linked activity (public to every logged-in account)
 *   GET  ?type=room&room=                   the activity of every account not banned from the room (room gate)
 *   POST { action: "start", provider }      lastfm | steam: sets the state cookie, returns the provider URL
 *   POST { action: "xStart", handle }       issues a 15-minute code for the X bio
 *   POST { action: "xVerify" }              checks the bio through FxTwitter, links, fetches the last post once
 *   POST { action: "unlink", provider }
 *
 * Provider keys never reach the client. External text goes out as data; the
 * client renders it with textContent / the linkify helper only.
 */
import { randomInt } from "node:crypto";
import { requireClientToken, requireRoomAccess } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import { isBannedFrom } from "../../lib/rooms.js";
import { nameColorSql } from "../../lib/cosmetics.js";
import { LIMITS, MESSAGES, hitWindow, tooManyRequests } from "../../lib/ratelimit.js";
import {
  PROVIDERS, providerAvailable, normalizeProvider,
  normalizeXHandle, makeXCode, bioHasCode, lastfmAuthUrl, steamLoginUrl,
  ROOM_FEED_LIMIT, sortFeed, hasActivity,
} from "../../lib/integrations.js";
import {
  cachedActivity, dropCachedActivity, lastfmRecentTrack, steamPlayer, steamLastPlayed, xProfile, checkXNow,
  linkIntegration, linkedElsewhere, AlreadyLinkedError, saveXCode, readXCode, clearXCode, xCodeTtl,
} from "../../lib/providers.js";
import { issueLinkState, requestOrigin } from "../../lib/linkstate.js";

const ALREADY_LINKED = "This account is already linked to another NAGORA account";

function rowsByProvider(rows) {
  return Object.fromEntries(rows.map(r => [r.provider, r]));
}

async function loadRows(userId) {
  const { rows } = await query(
    `SELECT provider, external_id, display_name, verified_at, last_post, last_checked_at
     FROM account_integrations WHERE user_id = $1`,
    [userId]
  );
  return rowsByProvider(rows);
}

// ── GET ───────────────────────────────────────────────────────────────────

async function getMine(req, res) {
  const me = req.account.user_id;
  const rows = await loadRows(me);
  const providers = {};
  for (const p of PROVIDERS) {
    const r = rows[p];
    providers[p] = {
      available: providerAvailable(p),
      linked: !!r,
      externalId: r?.external_id || null,
      displayName: r?.display_name || null,
      verifiedAt: r?.verified_at || null,
    };
  }
  providers.x.lastCheckedAt = rows.x?.last_checked_at || null;
  let pending = null;
  try {
    const code = await readXCode(me);
    if (code) pending = { handle: code.handle, code: code.code, expiresInSec: await xCodeTtl(me) };
  } catch (err) {
    console.error("[api/integrations] pending code lookup failed:", err?.message || err);
  }
  providers.x.pending = pending;
  res.status(200).json({ ok: true, providers });
}

function ageSec(at) {
  return Math.max(0, Math.round((Date.now() - at) / 1000));
}

async function lastfmActivity(userId, row) {
  const base = { handle: row.external_id, profileUrl: `https://www.last.fm/user/${encodeURIComponent(row.external_id)}` };
  try {
    const c = await cachedActivity("lastfm", userId, row.external_id, async () => {
      try {
        return { track: await lastfmRecentTrack(row.external_id) };
      } catch (err) {
        if (err.code === 17) return { private: true }; // recent listening hidden on Last.fm
        throw err;
      }
    });
    return { ...base, ...c.data, stale: c.stale, ageSec: ageSec(c.at) };
  } catch {
    return { ...base, unavailable: true };
  }
}

async function steamActivity(userId, row) {
  const base = { handle: row.display_name || null };
  try {
    const c = await cachedActivity("steam", userId, row.external_id, async () => ({ player: await steamPlayer(row.external_id) }));
    const out = { ...base, ...c.data, stale: c.stale, ageSec: ageSec(c.at) };
    // Not in a game: the last played one, when the library is public. Optional: a failure shows nothing.
    if (out.player && !out.player.game && out.player.isPublic) {
      try {
        const last = await cachedActivity("steam-last", userId, row.external_id, async () => ({ lastPlayed: await steamLastPlayed(row.external_id) }));
        if (last.data?.lastPlayed) out.lastPlayed = last.data.lastPlayed;
      } catch { /* logged by the cache */ }
    }
    return out;
  } catch {
    return { ...base, unavailable: true };
  }
}

async function getActivity(req, res) {
  const me = req.account.user_id;
  const target = typeof req.query?.userId === "string" ? req.query.userId : "";
  if (!target) return res.status(400).json({ ok: false, error: "Missing user id" });

  const verdict = await hitWindow(LIMITS.integrationActivity, me);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.integrationActivity);

  const { rows: exists } = await query("SELECT 1 FROM accounts WHERE user_id = $1", [target]);
  if (!exists.length) return res.status(404).json({ ok: false, error: "User not found" });

  const activity = await buildActivity(target, await loadRows(target));
  res.status(200).json({ ok: true, userId: target, activity });
}

/**
 * One account's activity from its rows (keyed by provider). Public by design:
 * every logged-in account sees every linked provider.
 */
async function buildActivity(userId, rows) {
  const activity = {};
  const jobs = [];
  if (rows.lastfm && providerAvailable("lastfm")) {
    jobs.push(lastfmActivity(userId, rows.lastfm).then(v => { activity.lastfm = v; }));
  }
  if (rows.steam && providerAvailable("steam")) {
    jobs.push(steamActivity(userId, rows.steam).then(v => { activity.steam = v; }));
  }
  // X is read from the database only: viewers never trigger an FxTwitter call.
  if (rows.x?.last_post) {
    activity.x = {
      handle: rows.x.external_id,
      post: rows.x.last_post,
      checkedAt: rows.x.last_checked_at || null,
    };
  }
  await Promise.all(jobs);
  return activity;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const ROOM_FEED_CONCURRENCY = 6;

/**
 * Rooms sidebar feed: every account with a linked provider that is not banned
 * from the room, live activity first. Bans and roles never leave the server.
 */
async function getRoomFeed(req, res) {
  const room = requireRoomAccess(req, res, req.query?.room);
  if (!room) return;

  const verdict = await hitWindow(LIMITS.integrationRoom, req.account.user_id);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.integrationRoom);

  const { rows } = await query(
    `SELECT a.user_id, a.username, a.showname, (a.avatar_bytes IS NOT NULL) AS has_avatar,
            ${nameColorSql("a")} AS name_color, a.bans,
            i.provider, i.external_id, i.display_name, i.last_post, i.last_checked_at
     FROM account_integrations i
     JOIN accounts a ON a.user_id = i.user_id
     ORDER BY a.id`
  );
  const byUser = new Map();
  for (const r of rows) {
    if (isBannedFrom(r.bans, room)) continue;
    let m = byUser.get(r.user_id);
    if (!m) {
      if (byUser.size >= ROOM_FEED_LIMIT) continue;
      m = {
        account: {
          userId: r.user_id,
          username: r.username,
          showname: r.showname || null,
          hasAvatar: !!r.has_avatar,
          nameColor: r.name_color || null,
        },
        rows: {},
      };
      byUser.set(r.user_id, m);
    }
    m.rows[r.provider] = r;
  }

  const members = await mapLimit([...byUser.values()], ROOM_FEED_CONCURRENCY,
    async (m) => ({ ...m.account, activity: await buildActivity(m.account.userId, m.rows) }));
  res.status(200).json({ ok: true, room, members: sortFeed(members.filter(m => hasActivity(m.activity))) });
}

// ── POST ──────────────────────────────────────────────────────────────────

async function startLink(req, res) {
  const provider = req.body?.provider;
  if (provider !== "lastfm" && provider !== "steam") return res.status(400).json({ ok: false, error: "Unknown provider" });
  if (!providerAvailable(provider)) return res.status(503).json({ ok: false, error: "Provider unavailable" });

  const verdict = await hitWindow(LIMITS.integrationLink, req.account.user_id);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.integrationLink);

  issueLinkState(req, res, req.account.user_id, provider);
  const url = provider === "lastfm"
    ? lastfmAuthUrl(process.env.LASTFM_API_KEY)
    : steamLoginUrl(requestOrigin(req));
  res.status(200).json({ ok: true, url });
}

async function xStart(req, res) {
  const me = req.account.user_id;
  const handle = normalizeXHandle(req.body?.handle);
  if (!handle) return res.status(400).json({ ok: false, error: "Invalid handle" });

  const verdict = await hitWindow(LIMITS.integrationLink, me);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.integrationLink);

  if (await linkedElsewhere("x", handle, me)) return res.status(409).json({ ok: false, error: ALREADY_LINKED });

  const code = makeXCode(randomInt);
  await saveXCode(me, handle, code);
  res.status(200).json({ ok: true, handle, code, expiresInSec: await xCodeTtl(me) });
}

async function xVerify(req, res) {
  const me = req.account.user_id;
  const pending = await readXCode(me);
  if (!pending) return res.status(400).json({ ok: false, error: "No pending code" });

  const verdict = await hitWindow(LIMITS.integrationXVerify, me);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.integrationXVerify);

  let profile;
  try {
    profile = await xProfile(pending.handle);
  } catch (err) {
    console.error("[api/integrations] X profile check failed:", err?.message || err);
    return res.status(502).json({ ok: false, error: "X profile unavailable" });
  }
  if (!profile || profile.screenName.toLowerCase() !== pending.handle.toLowerCase()) {
    return res.status(404).json({ ok: false, error: "X account not found" });
  }
  if (!bioHasCode(profile.description, pending.code)) {
    return res.status(400).json({ ok: false, error: "Code not found in bio" });
  }

  try {
    await linkIntegration(me, "x", profile.screenName, profile.name);
  } catch (err) {
    if (err instanceof AlreadyLinkedError) return res.status(409).json({ ok: false, error: ALREADY_LINKED });
    throw err;
  }
  await clearXCode(me);
  console.log(`[api/integrations] ${req.account.username} linked X @${profile.screenName}`);

  // The last original post, fetched once now; afterwards only the owner's activity refreshes it.
  const { ok, post } = await checkXNow(me, profile.screenName);
  res.status(200).json({ ok: true, handle: profile.screenName, lastPost: post, checked: ok });
}

async function unlink(req, res) {
  const me = req.account.user_id;
  const provider = normalizeProvider(req.body?.provider);
  if (!provider) return res.status(400).json({ ok: false, error: "Unknown provider" });

  const { rows } = await query(
    "DELETE FROM account_integrations WHERE user_id = $1 AND provider = $2 RETURNING external_id",
    [me, provider]
  );
  if (rows[0]) await dropCachedActivity(provider, me, rows[0].external_id);
  if (rows[0] && provider === "steam") await dropCachedActivity("steam-last", me, rows[0].external_id);
  if (provider === "x") await clearXCode(me);
  console.log(`[api/integrations] ${req.account.username} unlinked ${provider}`);
  res.status(200).json({ ok: true, provider, linked: false });
}

// ── Dispatch ──────────────────────────────────────────────────────────────

async function dispatch(req, res) {
  if (!req.account.user_id) return res.status(400).json({ ok: false, error: "Account is not initialized" });
  if (req.method === "GET") {
    const type = req.query?.type;
    if (type === "mine") return getMine(req, res);
    if (type === "activity") return getActivity(req, res);
    if (type === "room") return getRoomFeed(req, res);
    return res.status(400).json({ ok: false, error: "Invalid type parameter" });
  }
  if (req.method === "POST") {
    const action = req.body?.action;
    if (action === "start") return startLink(req, res);
    if (action === "xStart") return xStart(req, res);
    if (action === "xVerify") return xVerify(req, res);
    if (action === "unlink") return unlink(req, res);
    return res.status(400).json({ ok: false, error: "Unknown action" });
  }
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handler(req, res) {
  try {
    return await dispatch(req, res);
  } catch (err) {
    console.error("[api/integrations]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export default requireClientToken(handler);
