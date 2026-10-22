import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = req.account.user_id;
  const { rows } = await query(
    "UPDATE accounts SET last_seen_at = now() WHERE id = $1 RETURNING last_seen_at",
    [req.account.id]
  );

  const { rows: friendRows } = await query(
    `SELECT COUNT(*)::int AS online_count
     FROM friendships f
     JOIN accounts a ON a.user_id = CASE
       WHEN f.user_a = $1 THEN f.user_b
       ELSE f.user_a
     END
     WHERE (f.user_a = $1 OR f.user_b = $1)
       AND a.last_seen_at > now() - interval '1 minute'`,
    [userId]
  );

  res.status(200).json({
    ok: true,
    lastSeenAt: rows[0]?.last_seen_at || null,
    onlineFriendsCount: friendRows[0]?.online_count || 0,
  });
}

export default requireClientToken(handler);
