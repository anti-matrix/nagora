import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { rows } = await query(
      `SELECT username, user_id, showname, last_seen_at, avatar_bytes,
              (last_seen_at > now() - interval '1 minute') AS online
       FROM accounts
       ORDER BY username`
    );

    const users = rows.map(r => ({
      username: r.username,
      userId: r.user_id,
      online: !!r.online,
      lastSeenAt: r.last_seen_at,
      showname: r.showname || null,
      hasAvatar: !!r.avatar_bytes,
    }));

    res.status(200).json({ users });
  } catch (err) {
    console.error("[api/users]", err);
    res.status(500).json({ error: err.message });
  }
}

export default requireClientToken(handler);
