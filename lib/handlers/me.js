import { requireClientToken } from "../../lib/auth.js";
import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { query } from "../../lib/db.js";
import { bannedRooms } from "../../lib/rooms.js";
import { emailConfigured } from "../../lib/email.js";
import { peekCodeExtra } from "../../lib/codes.js";

/** The address waiting for its code, if any. A Redis problem must not break /api/me. */
async function pendingEmail(userId) {
  try {
    const extra = await peekCodeExtra("verify_email", userId);
    return typeof extra?.email === "string" ? extra.email : null;
  } catch (err) {
    console.error("[api/me] pending email lookup failed:", err?.message || err);
    return null;
  }
}

// Everything here is about the caller's own account. None of it (email least of
// all) is ever sent about another user.
async function getMe(req, res) {
  const { id, username, user_id, api_key, showname, has_avatar } = req.account;
  const secure = isSecureRequest(req);

  const { rows: [details] } = await query(
    `SELECT a.created_at, a.last_login_at, a.email, a.email_verified_at,
            (SELECT count(*)::int FROM friendships f WHERE a.user_id IN (f.user_a, f.user_b)) AS friends_count
     FROM accounts a
     WHERE a.id = $1`,
    [id]
  );
  const configured = emailConfigured();

  const sessionCookie = serializeCookie("nagora_session", api_key, {
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
  res.status(200).json({
    ok: true,
    username,
    userId: user_id || null,
    showname: showname || null,
    hasAvatar: !!has_avatar,
    // The caller's own room bans and role. Never sent about another user.
    bans: bannedRooms(req.account.bans),
    role: req.account.role || "user",
    createdAt: details?.created_at || null,
    lastLoginAt: details?.last_login_at || null,
    friendsCount: details?.friends_count || 0,
    email: details?.email || null,
    emailVerified: !!(details?.email && details?.email_verified_at),
    pendingEmail: configured && user_id ? await pendingEmail(user_id) : null,
    emailConfigured: configured,
  });
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
