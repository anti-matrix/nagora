import { requireAccountApiKey } from "../lib/auth.js";
import { serializeCookie, isSecureRequest } from "../lib/cookie.js";

async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { username, user_id, api_key } = req.account;
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

  res.setHeader("Set-Cookie", [sessionCookie, userIdCookie]);
  res.status(200).json({ ok: true, username, userId: user_id || null });
}

export default requireAccountApiKey(handler);
