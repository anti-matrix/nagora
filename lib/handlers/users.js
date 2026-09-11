import { query, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET")    { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    await ensureSchema();
    const { rows } = await query(
      `SELECT username, user_id, showname, last_seen_at,
              (last_seen_at > now() - interval '5 minutes') AS online
       FROM accounts
       ORDER BY username`
    );

    const users = rows.map(r => ({
      username: r.username,
      userId: r.user_id,
      online: !!r.online,
      lastSeenAt: r.last_seen_at,
      showname: r.showname || null,
    }));

    res.status(200).json({ users });
  } catch (err) {
    console.error("[api/users]", err);
    res.status(500).json({ error: err.message });
  }
}
