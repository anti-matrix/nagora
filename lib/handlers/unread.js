import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { rows } = await query(
    `SELECT sender_id, COUNT(*)::int AS unread_count, MAX(created_at) AS latest_at
     FROM messages
     WHERE recipient_id = $1 AND read_at IS NULL
     GROUP BY sender_id
     ORDER BY latest_at DESC`,
    [req.account.user_id]
  );

  res.status(200).json({
    ok: true,
    conversations: rows.map(r => ({
      senderId: r.sender_id,
      unreadCount: r.unread_count,
      latestMessageAt: r.latest_at,
    })),
  });
}

export default requireClientToken(handler);
