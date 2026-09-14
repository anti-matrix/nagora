/**
 * lib/auth.js — API key verification for NAGORA Vercel endpoints.
 *
 * Accepts the key via Authorization Bearer, X-API-Key header or ?key=,
 * and compares it timing-safe against the NAGORA_API_KEY env var.
 */

import { timingSafeEqual } from "node:crypto";
import { query, ensureSchema } from "./db.js";
import { parseCookies } from "./cookie.js";
import { verifyClientToken } from "./handshake.js";

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
 * Wrap an endpoint handler with per-account API-key authentication.
 * The key may be supplied via the nagora_session HttpOnly cookie,
 * Authorization Bearer, X-API-Key header, or ?key= query param.
 * A matching `accounts.api_key` row is attached as req.account.
 */
export function requireAccountApiKey(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-NAGORA-Token");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }

    const cookies = parseCookies(req);
    const key = cookies["nagora_session"] || extractApiKey(req);
    if (!key) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    try {
      await ensureSchema();
      const { rows } = await query(
        "SELECT username, user_id, api_key, showname, avatar_bytes FROM accounts WHERE api_key = $1",
        [key]
      );
      if (!rows.length) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }
      req.account = rows[0];
      return handler(req, res);
    } catch (err) {
      console.error("[lib/auth] requireAccountApiKey error", err);
      res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Same as requireAccountApiKey, but skips the per-request ensureSchema() call.
 * Use this for low-overhead endpoints such as GET /api/file.
 */
export function requireAccountApiKeyNoSchema(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-NAGORA-Token");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }

    const cookies = parseCookies(req);
    const key = cookies["nagora_session"] || extractApiKey(req);
    if (!key) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    try {
      const { rows } = await query(
        "SELECT username, user_id, api_key, showname, avatar_bytes FROM accounts WHERE api_key = $1",
        [key]
      );
      if (!rows.length) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }
      req.account = rows[0];
      return handler(req, res);
    } catch (err) {
      console.error("[lib/auth] requireAccountApiKeyNoSchema error", err);
      res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Session + short-lived client-token wrapper.
 * Performs the same account lookup as requireAccountApiKeyNoSchema, then
 * requires a valid X-NAGORA-Token whose `sub` matches req.account.user_id.
 */
export function requireClientToken(handler) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-NAGORA-Token");

    if (req.method === "OPTIONS") { res.status(204).end(); return; }

    const token = req.headers["x-nagora-token"];
    if (!token) {
      res.status(401).json({ error: "Missing client token" });
      return;
    }

    try {
      const cookies = parseCookies(req);
      const key = cookies["nagora_session"] || extractApiKey(req);
      if (!key) {
        res.status(401).json({ error: "Missing API key" });
        return;
      }

      const { rows } = await query(
        "SELECT username, user_id, api_key, showname, avatar_bytes FROM accounts WHERE api_key = $1",
        [key]
      );
      if (!rows.length) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }
      req.account = rows[0];

      const payload = verifyClientToken(token);
      if (!payload || payload.sub !== req.account.user_id) {
        res.status(401).json({ error: "Invalid client token" });
        return;
      }

      return handler(req, res);
    } catch (err) {
      console.error("[lib/auth] requireClientToken error", err);
      res.status(500).json({ error: err.message });
    }
  };
}

