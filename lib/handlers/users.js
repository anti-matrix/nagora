import { requireClientToken } from "../../lib/auth.js";
import { query, presenceStatusSql } from "../../lib/db.js";
import { nameColorSql } from "../../lib/cosmetics.js";

async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    // Presence (online / lastSeenAt) is only revealed for friends.
    const { rows } = await query(
      `SELECT a.username, a.user_id, a.showname, a.last_seen_at,
              (a.avatar_bytes IS NOT NULL) AS has_avatar,
              ${nameColorSql("a")} AS name_color,
              ${presenceStatusSql("a")} AS status,
              EXISTS (
                SELECT 1 FROM friendships f
                WHERE LEAST(f.user_a, f.user_b) = LEAST($1, a.user_id)
                  AND GREATEST(f.user_a, f.user_b) = GREATEST($1, a.user_id)
              ) AS is_friend
       FROM accounts a
       ORDER BY a.username`,
      [req.account.user_id]
    );

    const users = rows.map(r => ({
      username: r.username,
      userId: r.user_id,
      status: r.is_friend ? r.status : "offline",
      online: r.is_friend && r.status === "online",
      lastSeenAt: r.is_friend ? r.last_seen_at : null,
      showname: r.showname || null,
      hasAvatar: !!r.has_avatar,
      nameColor: r.name_color || null,
    }));

    res.status(200).json({ users });
  } catch (err) {
    console.error("[api/users]", err);
    res.status(500).json({ error: err.message });
  }
}

export default requireClientToken(handler);
