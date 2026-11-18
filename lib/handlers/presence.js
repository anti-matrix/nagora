import { requireClientToken } from "../../lib/auth.js";
import { query, presenceStatusSql } from "../../lib/db.js";
import { refreshXIfDue } from "../../lib/providers.js";
import { runAfterResponse } from "../../lib/background.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // active:false = keepalive only (app open, user idle) → keeps them "away", not offline.
  const active = req.body?.active !== false;
  const userId = req.account.user_id;
  const { rows } = await query(
    `UPDATE accounts
     SET last_ping_at = now(),
         last_seen_at = CASE WHEN $2 THEN now() ELSE last_seen_at END
     WHERE id = $1
     RETURNING last_seen_at`,
    [req.account.id, active]
  );

  const { rows: friendRows } = await query(
    `SELECT COUNT(*)::int AS online_count
     FROM friendships f
     JOIN accounts a ON a.user_id = CASE
       WHEN f.user_a = $1 THEN f.user_b
       ELSE f.user_a
     END
     WHERE (f.user_a = $1 OR f.user_b = $1)
       AND ${presenceStatusSql("a")} <> 'offline'`,
    [userId]
  );

  // X refresh (only when due, claimed atomically): after the response when the
  // runtime has waitUntil, else awaited. Viewers never trigger it.
  await runAfterResponse(refreshXIfDue(userId));

  res.status(200).json({
    ok: true,
    lastSeenAt: rows[0]?.last_seen_at || null,
    onlineFriendsCount: friendRows[0]?.online_count || 0,
  });
}

export default requireClientToken(handler);
