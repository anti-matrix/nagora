import { requireClientToken } from "../../lib/auth.js";
import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // Drop the keepalive so the user shows offline right away instead of "away".
  await query("UPDATE accounts SET last_ping_at = NULL WHERE id = $1", [req.account.id]);

  const secure = isSecureRequest(req);
  const clearCookie = serializeCookie("nagora_session", "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 0,
    secure,
  });

  res.setHeader("Set-Cookie", clearCookie);
  res.status(200).json({ ok: true });
}

export default requireClientToken(handler);
