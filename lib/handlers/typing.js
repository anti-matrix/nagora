import { requireAccountApiKey } from "../../lib/auth.js";
import { kv, NS } from "../../lib/redis.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recipientUserId, typing } = req.body || {};

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  const key = `${NS}typing:${req.account.user_id}:${recipientUserId}`;

  if (typing === true) {
    await kv.set(key, "1", { ex: 3 });
  } else {
    await kv.del(key);
  }

  res.status(200).json({ ok: true });
}

export default requireAccountApiKey(handler);
