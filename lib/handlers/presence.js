import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = req.account.api_key;
  const { rows } = await query(
    "UPDATE accounts SET last_seen_at = now() WHERE api_key = $1 RETURNING last_seen_at",
    [key]
  );
  res.status(200).json({ ok: true, lastSeenAt: rows[0]?.last_seen_at || null });
}

export default requireClientToken(handler);
