import { requireClientToken } from "../../lib/auth.js";
import { query, areFriends } from "../../lib/db.js";
import { MESSAGE_SELECT, toCamelMessage } from "../../lib/messages.js";
import sharp from "sharp";

async function uploadFile(req, res) {
  const { recipientUserId, imageBase64, audioBase64, durationMs, mediaType } = req.body || {};

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  const hasImage = typeof imageBase64 === "string" && imageBase64.trim();
  const hasAudio = typeof audioBase64 === "string" && audioBase64.trim();
  if (!recipientUserId || (hasImage && hasAudio) || (!hasImage && !hasAudio)) {
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

  if (hasImage) {
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
         (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes, media_duration_ms, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, sender_id, recipient_id, content, created_at, read_at,
                   media_type, media_width, media_height, media_duration_ms, reply_to_id`,
      [me, them, "", "image/webp", info.width, info.height, compressed, null, replyToId]
    );

    const { rows } = await query(
      `${MESSAGE_SELECT}
       WHERE m.id = $1`,
      [insertRows[0].id]
    );

    res.status(201).json({ ok: true, message: toCamelMessage(rows[0]) });
  } else {
    const buffer = Buffer.from(audioBase64.trim(), "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Invalid audio file" });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "Audio file is too large" });
    }

    const parsedDuration = parseInt(durationMs, 10);
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;
    const storedType = typeof mediaType === "string" && mediaType.startsWith("audio/") ? mediaType : "audio/webm";

    const { rows: insertRows } = await query(
      `INSERT INTO messages
         (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes, media_duration_ms, reply_to_id)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7)
       RETURNING id, sender_id, recipient_id, content, created_at, read_at,
                   media_type, media_width, media_height, media_duration_ms, reply_to_id`,
      [me, them, "", storedType, buffer, duration, replyToId]
    );

    const { rows } = await query(
      `${MESSAGE_SELECT}
       WHERE m.id = $1`,
      [insertRows[0].id]
    );

    res.status(201).json({ ok: true, message: toCamelMessage(rows[0]) });
  }
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

export default requireClientToken(handler);
