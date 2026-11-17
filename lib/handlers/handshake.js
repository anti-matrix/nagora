import { requireSession } from "../../lib/auth.js";
import { signClientToken } from "../../lib/handshake.js";
import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { bannedRooms } from "../../lib/rooms.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, user_id, api_key, showname, has_avatar } = req.account;
  const secure = isSecureRequest(req);

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

  const token = signClientToken(req.account);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  res.setHeader("Set-Cookie", [sessionCookie, userIdCookie]);
  res.status(200).json({
    ok: true,
    token,
    expiresAt,
    username,
    userId: user_id,
    showname: showname || null,
    hasAvatar: !!has_avatar,
    // The caller's own room bans and role. Never sent about another user.
    bans: bannedRooms(req.account.bans),
    role: req.account.role || "user",
  });
}

export default requireSession(handler);
