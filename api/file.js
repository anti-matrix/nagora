import { requireAccountApiKey, requireAccountApiKeyNoSchema } from "../lib/auth.js";
import { query } from "../lib/db.js";
import sharp from "sharp";

function toCamelMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    content: row.content,
    createdAt: row.created_at,
    readAt: row.read_at,
    mediaType: row.media_type || null,
    mediaWidth: row.media_width || null,
    mediaHeight: row.media_height || null,
  };
}

async function uploadFile(req, res) {
  const { recipientUserId, imageBase64 } = req.body || {};

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  if (!recipientUserId || typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return res.status(400).json({ error: "Image file is required" });
  }

  const { rows: recipientRows } = await query(
    "SELECT username, user_id FROM accounts WHERE user_id = $1",
    [recipientUserId]
  );
  if (!recipientRows.length) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  const buffer = Buffer.from(imageBase64.trim(), "base64");
  if (!buffer.length) {
    return res.status(400).json({ error: "Invalid image file" });
  }

  let compressed, info;
  try {
    ({ data: compressed, info } = await sharp(buffer)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true }));
  } catch (err) {
    console.error("[api/file] sharp error", err);
    return res.status(400).json({ error: "Invalid image file" });
  }

  const { rows } = await query(
    `INSERT INTO messages
       (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, sender_id, recipient_id, content, created_at, read_at,
               media_type, media_width, media_height`,
    [req.account.user_id, recipientUserId, "", "image/webp", info.width, info.height, compressed]
  );

  res.status(201).json({ ok: true, message: toCamelMessage(rows[0]) });
}

async function serveFile(req, res) {
  const idRaw = req.query?.id;
  if (idRaw === undefined || idRaw === null || idRaw === "") {
    return res.status(400).json({ error: "Missing file id" });
  }

  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid file id" });
  }

  const { rows } = await query(
    "SELECT sender_id, recipient_id, media_type, media_bytes FROM messages WHERE id = $1",
    [id]
  );

  if (!rows.length || !rows[0].media_bytes) {
    return res.status(404).json({ error: "File not found" });
  }

  if (rows[0].sender_id !== req.account.user_id && rows[0].recipient_id !== req.account.user_id) {
    return res.status(403).json({ error: "Access denied" });
  }

  res.setHeader("Content-Type", rows[0].media_type || "image/webp");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.status(200).send(rows[0].media_bytes);
}

async function handler(req, res) {
  if (req.method === "POST") return uploadFile(req, res);
  if (req.method === "GET") return serveFile(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

export default function (req, res) {
  if (req.method === "GET") return requireAccountApiKeyNoSchema(handler)(req, res);
  return requireAccountApiKey(handler)(req, res);
}
