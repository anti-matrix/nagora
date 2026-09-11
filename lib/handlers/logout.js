import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

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
