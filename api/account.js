import { query, ensureSchema } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateApiKey } from "../lib/apikey.js";
import { kv, userKey, USERIDS } from "../lib/redis.js";

const USERNAME_RE = /^[^\s]{5,15}$/;
const HAS_LETTER  = /[A-Za-z]/;
const HAS_NUMBER  = /[0-9]/;

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

async function signup(req, res, { username, password, confirmPassword, userId }) {
  username = String(username ?? "").trim();
  password = String(password ?? "");
  confirmPassword = String(confirmPassword ?? "");

  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: "Username must be 5-15 characters (no spaces)" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (!HAS_LETTER.test(password) || !HAS_NUMBER.test(password)) {
    res.status(400).json({ error: "Password must contain letters and numbers" });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const passHash = await hashPassword(password);

  try {
    await ensureSchema();
    const apiKey = generateApiKey(username, userId);
    const { rows } = await query(
      "INSERT INTO accounts (username, pass_hash, user_id, api_key) VALUES ($1, $2, $3, $4) RETURNING username, user_id, created_at",
      [username, passHash, userId || null, apiKey]
    );
    await linkAccount(userId, username);
    res.status(201).json({ ok: true, username: rows[0].username, userId: rows[0].user_id });
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

  await ensureSchema();
  const { rows } = await query(
    "SELECT username, pass_hash, user_id, api_key FROM accounts WHERE username = $1",
    [username]
  );

  const row = rows[0];
  const valid = row && await verifyPassword(password, row.pass_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  let apiKey = row.api_key;
  if (!apiKey) {
    apiKey = generateApiKey(row.username, row.user_id);
    await query("UPDATE accounts SET api_key = $1 WHERE username = $2", [apiKey, username]);
  }

  await query("UPDATE accounts SET last_login_at = now() WHERE username = $1", [username]);
  res.status(200).json({ ok: true, username: row.username, userId: row.user_id, apiKey });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed" }); return; }

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
