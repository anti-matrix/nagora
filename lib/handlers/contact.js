import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const targetUserId = req.query?.targetUserId;
  if (!targetUserId) {
    return res.status(400).json({ error: "Missing target user id" });
  }
  if (targetUserId === req.account.user_id) {
    return res.status(400).json({ error: "Invalid target user id" });
  }

  const { rows: accountRows } = await query(
    `SELECT username, showname, last_seen_at, avatar_bytes,
            (last_seen_at > now() - interval '15 seconds') AS online
     FROM accounts
     WHERE user_id = $1`,
    [targetUserId]
  );
  if (!accountRows.length) {
    return res.status(400).json({ error: "User not found" });
  }

  const a = accountRows[0];

  const { rows: friendRows } = await query(
    `SELECT created_at FROM friendships
     WHERE LEAST(user_a, user_b) = LEAST($1, $2)
       AND GREATEST(user_a, user_b) = GREATEST($1, $2)
     LIMIT 1`,
    [req.account.user_id, targetUserId]
  );

  const { rows: messageRows } = await query(
    `SELECT MIN(created_at) AS first_at
     FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2)
        OR (sender_id = $2 AND recipient_id = $1)`,
    [req.account.user_id, targetUserId]
  );

  res.status(200).json({
    ok: true,
    userId: targetUserId,
    username: a.username,
    showname: a.showname || null,
    online: !!a.online,
    lastSeenAt: a.last_seen_at,
    hasAvatar: !!a.avatar_bytes,
    friendsSince: friendRows[0]?.created_at || null,
    firstConversationAt: messageRows[0]?.first_at || null,
  });
}

export default requireClientToken(handler);
