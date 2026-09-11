import { requireAccountApiKey, requireAccountApiKeyNoSchema } from "../lib/auth.js";
import { query, areFriends } from "../lib/db.js";
import sharp from "sharp";

function toCamelMessage(row) {
  const replyTo = row.reply_id ? {
    id: row.reply_id,
    senderId: row.reply_sender_id,
    senderUsername: row.reply_sender_showname || row.reply_sender_username,
    content: row.reply_content,
    mediaType: row.reply_media_type || null,
  } : null;

  const message = {
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

  if (replyTo) message.replyTo = replyTo;
  return message;
}

async function uploadFile(req, res) {
  const { recipientUserId, imageBase64 } = req.body || {};

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  if (!recipientUserId || typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return res.status(400).json({ error: "Image file is required" });
  }

  const me = req.account.user_id;
  const them = recipientUserId;

  const { rows: recipientRows } = await query(
    "SELECT username, user_id FROM accounts WHERE user_id = $1",
    [recipientUserId]
  );
  if (!recipientRows.length) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  const friends = await areFriends(me, them);
  if (!friends) {
    return res.status(403).json({ error: "You must be friends to send messages" });
  }

  let replyToId = null;
  if (req.body.replyToId !== undefined && req.body.replyToId !== null) {
    const parsed = parseInt(req.body.replyToId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return res.status(400).json({ error: "Invalid reply message" });
    }
    replyToId = parsed;
  }

  if (replyToId) {
    const { rows: replyRows } = await query(
      "SELECT sender_id, recipient_id FROM messages WHERE id = $1",
      [replyToId]
    );
    if (!replyRows.length) {
      return res.status(400).json({ error: "Invalid reply message" });
    }
    const rr = replyRows[0];
    if (!((rr.sender_id === me && rr.recipient_id === them) || (rr.sender_id === them && rr.recipient_id === me))) {
      return res.status(400).json({ error: "Invalid reply message" });
    }
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

  const { rows: insertRows } = await query(
    `INSERT INTO messages
       (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes, reply_to_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, sender_id, recipient_id, content, created_at, read_at,
                 media_type, media_width, media_height, reply_to_id`,
    [me, them, "", "image/webp", info.width, info.height, compressed, replyToId]
  );

  const { rows } = await query(
    `SELECT m.id, m.sender_id, m.recipient_id, m.content, m.created_at, m.read_at,
            m.media_type, m.media_width, m.media_height, m.reply_to_id,
            rm.id AS reply_id,
            rm.sender_id AS reply_sender_id,
            rm.content AS reply_content,
            rm.media_type AS reply_media_type,
            ra.username AS reply_sender_username,
            ra.showname AS reply_sender_showname
     FROM messages m
     LEFT JOIN messages rm ON rm.id = m.reply_to_id
     LEFT JOIN accounts ra ON ra.user_id = rm.sender_id
     WHERE m.id = $1`,
    [insertRows[0].id]
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
