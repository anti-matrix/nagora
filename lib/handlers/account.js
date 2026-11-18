import { randomUUID } from "node:crypto";
import { query } from "../../lib/db.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { generateApiKey, generateAuthKey } from "../../lib/apikey.js";
import { isFromNagora } from "../../lib/auth.js";
import { kv, userKey, USERIDS } from "../../lib/redis.js";
import { parseCookies, serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { LIMITS, MESSAGES, clientIp, hitWindow, peekWindow, tooManyRequests } from "../../lib/ratelimit.js";
import { passwordProblem, usernameProblem } from "../../lib/validate.js";
import { refreshXIfDue } from "../../lib/providers.js";
import { runAfterResponse } from "../../lib/background.js";

async function linkAccount(userId, username) {
  if (!userId) return;
  const key = userKey(userId);
  const existing = await kv.get(key);
  if (existing) {
    await kv.set(key, { ...existing, username, accountCreatedAt: new Date().toISOString() });
  } else {
    await kv.set(key, {
      userId,
      username,
      accountCreatedAt: new Date().toISOString(),
      signup: true,
    });
    await kv.sadd(USERIDS, userId);
  }
}

function makeAuthCookies(req, apiKey, userId) {
  const secure = isSecureRequest(req);
  const sessionCookie = serializeCookie("nagora_session", apiKey, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 2592000,
    secure,
  });
  const userIdCookie = serializeCookie("userId", userId, {
    path: "/",
    sameSite: "Lax",
    maxAge: 31536000,
    secure,
  });
  return [sessionCookie, userIdCookie];
}

async function signup(req, res, { username, password, confirmPassword, userId }) {
  username = String(username ?? "").trim();
  password = String(password ?? "");
  confirmPassword = String(confirmPassword ?? "");

  const nameProblem = usernameProblem(username);
  if (nameProblem) {
    res.status(400).json({ error: nameProblem });
    return;
  }
  // Same rules as password recovery (lib/validate.js).
  const problem = passwordProblem(password);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  // Counted only once the form is valid, so typos do not use up the allowance.
  const verdict = await hitWindow(LIMITS.signup, clientIp(req));
  if (!verdict.allowed) {
    tooManyRequests(res, verdict, MESSAGES.signup);
    return;
  }

  // Reserved names answer exactly like a taken name.
  const { rows: reserved } = await query(
    "SELECT 1 FROM reserved_usernames WHERE username = lower($1)",
    [username]
  );
  if (reserved.length) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passHash = await hashPassword(password);

  try {
    const apiKey = generateApiKey();
    const { rows } = await query(
      "INSERT INTO accounts (username, pass_hash, user_id, api_key) VALUES ($1, $2, $3, $4) RETURNING username, user_id, created_at",
      [username, passHash, userId || null, apiKey]
    );
    await linkAccount(userId, username);

    const insertedUserId = rows[0].user_id;
    if (insertedUserId) {
      const secure = isSecureRequest(req);
      const userIdCookie = serializeCookie("userId", insertedUserId, {
        path: "/",
        sameSite: "Lax",
        maxAge: 31536000,
        secure,
      });
      res.setHeader("Set-Cookie", userIdCookie);
    }

    res.status(201).json({ ok: true, username: rows[0].username, userId: insertedUserId });
  } catch (err) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    throw err;
  }
}

async function login(req, res, { username, password }) {
  username = String(username ?? "").trim();
  password = String(password ?? "");

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  // 10 failed attempts per 15 minutes for this IP + username pair.
  const failKey = `${clientIp(req)}:${username.toLowerCase()}`;
  const gate = await peekWindow(LIMITS.loginFail, failKey);
  if (!gate.allowed) {
    tooManyRequests(res, gate, MESSAGES.login);
    return;
  }

  const { rows } = await query(
    "SELECT username, pass_hash, user_id, api_key, auth_key FROM accounts WHERE username = $1",
    [username]
  );

  const row = rows[0];
  const valid = row && await verifyPassword(password, row.pass_hash);
  if (!valid) {
    await hitWindow(LIMITS.loginFail, failKey);
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  let userId = row.user_id;
  if (!userId) {
    const cookieUserId = parseCookies(req)["userId"];
    if (cookieUserId) {
      try {
        await query("UPDATE accounts SET user_id = $1 WHERE username = $2", [cookieUserId, username]);
        userId = cookieUserId;
      } catch (err) {
        if (err.code === "23505") {
          userId = randomUUID();
          await query("UPDATE accounts SET user_id = $1 WHERE username = $2", [userId, username]);
        } else {
          throw err;
        }
      }
    } else {
      userId = randomUUID();
      await query("UPDATE accounts SET user_id = $1 WHERE username = $2", [userId, username]);
    }
  }

  let apiKey = row.api_key;
  if (!apiKey) {
    apiKey = generateApiKey();
    await query("UPDATE accounts SET api_key = $1 WHERE username = $2", [apiKey, username]);
  }

  // auth_key stays server-side (it signs the client token); the cookie carries api_key.
  if (!row.auth_key) {
    await query("UPDATE accounts SET auth_key = $1 WHERE username = $2", [generateAuthKey(userId, apiKey), username]);
  }

  await query("UPDATE accounts SET last_login_at = now() WHERE username = $1", [username]);

  // The linked X account's last post is refreshed by the owner's own activity
  // (login and heartbeat), after the response when the runtime allows it.
  await runAfterResponse(refreshXIfDue(userId));

  res.setHeader("Set-Cookie", makeAuthCookies(req, apiKey, userId));
  res.status(200).json({ ok: true, username: row.username, userId });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!isFromNagora(req))      { res.status(403).json({ error: "Forbidden" }); return; }

  const { action, username, password, confirmPassword, userId } = req.body || {};

  try {
    if (action === "signup") { await signup(req, res, { username, password, confirmPassword, userId }); return; }
    if (action === "login")  { await login(req, res, { username, password }); return; }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[api/account]", err);
    res.status(500).json({ error: err.message });
  }
}
