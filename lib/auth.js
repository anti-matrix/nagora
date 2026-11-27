/**
 * lib/auth.js — auth wrappers for NAGORA Vercel endpoints.
 *
 * Owner/devtool keys (shell, logs): Authorization Bearer, X-API-Key or ?key=,
 * compared timing-safe against env vars.
 * Accounts: the nagora_session cookie (api_key) + X-NAGORA-Token signed with
 * the server-only auth_key, same-origin only.
 */

import { timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import { parseCookies } from "./cookie.js";
import { verifyClientToken } from "./handshake.js";
import { API_KEY_PREFIX, AUTH_KEY_PREFIX } from "./apikey.js";
import { normalizeRoom, isBannedFrom, bannedRooms } from "./rooms.js";
import { nameColorAllowedSql } from "./cosmetics.js";

export function extractApiKey(req) {
  const auth = req.headers["authorization"];
  if (auth && /^Bearer\s+/i.test(auth)) return auth.slice(7).trim();

  const header = req.headers["x-api-key"];
  if (header) return header;

  const queryKey = req.query?.key;
  if (queryKey) return queryKey;

  return null;
}

export async function isValidApiKey(key) {
  const accepted = process.env.NAGORA_API_KEY;
  if (!accepted || !key) return false;

  const presented = Buffer.from(key);
  const expected  = Buffer.from(accepted);

  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * DEVTOOL-level keys: read from the NAGORA_DEVTOOLS_KEYS env var
 * (comma-separated), for lower-privilege tooling endpoints.
 */
export function devToolKeys() {
  const raw = process.env.NAGORA_DEVTOOLS_KEYS || "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(k => String(k).trim()).filter(Boolean);
    }
  } catch (e) { /* not a JSON array — treat as comma-separated */ }
  return raw.split(",").map(k => k.trim()).filter(Boolean);
}

export function isValidDevToolKey(key) {
  if (!key) return false;
  return devToolKeys().some(accepted => {
    const a = Buffer.from(accepted);
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * Wrap an endpoint handler with DEVTOOL-level auth.
 * OPTIONS is always allowed through.
 */
export function requireDevTool(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const key = extractApiKey(req);
    if (!key) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }
    if (!isValidDevToolKey(key)) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    return handler(req, res);
  };
}

/**
 * Wrap an endpoint handler with OWNER-level API key auth.
 * OPTIONS is always allowed through.
 */
export function requireApiKey(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }

    const key = extractApiKey(req);
    if (!key) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    const valid = await isValidApiKey(key);
    if (!valid) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    return handler(req, res);
  };
}

/**
 * True when the request was made by the NAGORA front-end itself (same origin).
 * Browsers send Sec-Fetch-Site / Origin; anything cross-site is rejected.
 * No CORS headers are sent on account endpoints, so foreign-origin preflights fail.
 */
export function isFromNagora(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return false;

  const origin = req.headers["origin"];
  if (origin) {
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Columns attached as req.account. avatar_bytes itself is never loaded here.
 * auth_key is server-only: handlers must never send it to the client.
 */
const ACCOUNT_COLUMNS =
  "id, username, user_id, api_key, auth_key, showname, (avatar_bytes IS NOT NULL) AS has_avatar, bans, role, name_color, "
  + nameColorAllowedSql("accounts");

/**
 * Look up the account for the nagora_session cookie (api_key). Cookie only.
 * Exported for the provider callbacks (/api/lastfm-callback, /api/steam-callback):
 * they are top-level redirects from another site, so they can carry neither the
 * X-NAGORA-Token nor a same-origin Sec-Fetch-Site. They answer only redirects,
 * never account data, and also require a signed state bound to this account.
 */
export async function loadSessionAccount(req) {
  const apiKey = parseCookies(req)["nagora_session"];
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX) || apiKey.startsWith(AUTH_KEY_PREFIX)) return null;

  const { rows } = await query(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE api_key = $1`,
    [apiKey]
  );
  return rows[0] || null;
}

/**
 * Shared front-end-only + session gate. With `needsToken`, also requires a
 * valid X-NAGORA-Token bound to this session.
 */
function accountGate(handler, { needsToken }) {
  return async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).end(); return; }

    if (!isFromNagora(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const account = await loadSessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      if (needsToken) {
        const token = req.headers["x-nagora-token"];
        if (!token) {
          res.status(401).json({ error: "Missing client token" });
          return;
        }
        if (!verifyClientToken(token, account)) {
          res.status(401).json({ error: "Invalid client token" });
          return;
        }
      }

      req.account = account;
      // awaited so a rejected handler lands in the catch below instead of crashing the function
      return await handler(req, res);
    } catch (err) {
      console.error("[lib/auth] accountGate error", err);
      res.status(500).json({ error: err.message });
    }
  };
}

/** Session cookie only — used by /api/handshake, which mints the client token. */
export function requireSession(handler) {
  return accountGate(handler, { needsToken: false });
}

/** Session cookie + X-NAGORA-Token — used by every other account endpoint. */
export function requireClientToken(handler) {
  return accountGate(handler, { needsToken: true });
}

/**
 * Room gate, called by every room endpoint (read or write) after the auth
 * wrapper. Returns the normalized room name, or null after answering:
 *   400 unknown room · 403 { ok:false, error:"banned", all, rooms } when banned.
 * req.account.bans is read from the database on every request, so a ban
 * applies to the very next call.
 */
export function requireRoomAccess(req, res, room) {
  const name = normalizeRoom(room);
  if (!name) {
    res.status(400).json({ ok: false, error: "Unknown room" });
    return null;
  }
  if (isBannedFrom(req.account?.bans, name)) {
    res.status(403).json({ ok: false, error: "banned", ...bannedRooms(req.account.bans) });
    return null;
  }
  return name;
}

