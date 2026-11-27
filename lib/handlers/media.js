import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const withUserId = req.query?.with;
  if (!withUserId) {
    return res.status(400).json({ error: "Missing 'with' parameter" });
  }

  const me = req.account.user_id;
  const them = withUserId;

  const { rows } = await query(
    `SELECT id, sender_id, content, media_type, media_width, media_height, media_duration_ms, created_at
     FROM messages
     WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
       AND media_type IS NOT NULL
     ORDER BY created_at DESC`,
    [me, them]
  );

  res.status(200).json({
    ok: true,
    media: rows.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      content: r.content || "",
      mediaType: r.media_type,
      mediaWidth: r.media_width,
      mediaHeight: r.media_height,
      mediaDurationMs: r.media_duration_ms,
      createdAt: r.created_at,
    })),
  });
}

export default requireClientToken(handler);
