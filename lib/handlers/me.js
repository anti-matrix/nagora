import { requireClientToken } from "../../lib/auth.js";
import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { query } from "../../lib/db.js";

async function getMe(req, res) {
  const { username, user_id, auth_key, showname, has_avatar } = req.account;
  const secure = isSecureRequest(req);

  const sessionCookie = serializeCookie("nagora_session", auth_key, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 2592000,
    secure,
  });
  const userIdCookie = serializeCookie("userId", user_id || "", {
    path: "/",
    sameSite: "Lax",
    maxAge: 31536000,
    secure,
  });

  res.setHeader("Set-Cookie", [sessionCookie, userIdCookie]);
  res.status(200).json({ ok: true, username, userId: user_id || null, showname: showname || null, hasAvatar: !!has_avatar });
}

async function postMe(req, res) {
  const { action, showname } = req.body || {};

  if (action !== "setShowname") {
    return res.status(400).json({ error: "Unknown action" });
  }

  const trimmed = String(showname ?? "").trim();
  const value = trimmed || null;

  if (trimmed.length > 20) {
    return res.status(400).json({ error: "Showname must be 20 characters or less" });
  }

  await query("UPDATE accounts SET showname = $1 WHERE user_id = $2", [value, req.account.user_id]);

  res.status(200).json({ ok: true, showname: value });
}

async function handler(req, res) {
  if (req.method === "GET") return getMe(req, res);
  if (req.method === "POST") return postMe(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
