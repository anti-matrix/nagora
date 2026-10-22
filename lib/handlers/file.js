import { requireClientToken } from "../../lib/auth.js";
import { query, areFriends } from "../../lib/db.js";
import { MESSAGE_SELECT, toCamelMessage } from "../../lib/messages.js";
import sharp from "sharp";

// Vercel caps function request AND response bodies at 4.5 MB, so videos are
// uploaded in chunks (staged in media_uploads) and served in parts.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_SIDE = 854; // 480p (854x480 landscape / 480x854 portrait)
const FILE_PART_BYTES = 4 * 1024 * 1024;

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function insertMediaMessage(res, columns) {
  const { rows: insertRows } = await query(
    `INSERT INTO messages
       (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes, media_duration_ms, reply_to_id)
     VALUES ($1, $2, '', $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    columns
  );
  return respondWithMessage(res, insertRows[0].id);
}

async function respondWithMessage(res, messageId) {
  const { rows } = await query(
    `${MESSAGE_SELECT}
     WHERE m.id = $1`,
    [messageId]
  );
  res.status(201).json({ ok: true, message: toCamelMessage(rows[0]) });
}

/** POST { action: "videoChunk", uploadId?, chunkBase64 } — append one chunk to a staged upload. */
async function uploadVideoChunk(req, res) {
  const { uploadId, chunkBase64 } = req.body || {};
  const me = req.account.user_id;

  if (!me) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }
  if (typeof chunkBase64 !== "string" || !chunkBase64.trim()) {
    return res.status(400).json({ error: "Invalid video file" });
  }

  const chunk = Buffer.from(chunkBase64.trim(), "base64");
  if (!chunk.length) {
    return res.status(400).json({ error: "Invalid video file" });
  }
  if (chunk.length > MAX_VIDEO_CHUNK_BYTES) {
    return res.status(400).json({ error: "Video chunk is too large" });
  }

  if (uploadId === undefined || uploadId === null) {
    // Drop abandoned uploads before starting a new one.
    await query(
      `DELETE FROM media_uploads
       WHERE created_at < now() - interval '1 day'
          OR (owner_id = $1 AND created_at < now() - interval '1 hour')`,
      [me]
    );
    const { rows } = await query(
      "INSERT INTO media_uploads (owner_id, bytes) VALUES ($1, $2) RETURNING id, octet_length(bytes) AS size",
      [me, chunk]
    );
    return res.status(201).json({ ok: true, uploadId: rows[0].id, size: rows[0].size });
  }

  const id = parsePositiveInt(uploadId);
  if (!id) {
    return res.status(400).json({ error: "Invalid video upload" });
  }

  const { rows } = await query(
    `UPDATE media_uploads SET bytes = bytes || $1
     WHERE id = $2 AND owner_id = $3 AND octet_length(bytes) + $4 <= $5
     RETURNING octet_length(bytes) AS size`,
    [chunk, id, me, chunk.length, MAX_VIDEO_BYTES]
  );
  if (!rows.length) {
    return res.status(400).json({ error: "Invalid video upload or video file is too large" });
  }

  res.status(200).json({ ok: true, uploadId: id, size: rows[0].size });
}

async function uploadFile(req, res) {
  const { action, recipientUserId, imageBase64, audioBase64, durationMs, mediaType } = req.body || {};

  if (action === "videoChunk") return uploadVideoChunk(req, res);

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  const hasImage = typeof imageBase64 === "string" && imageBase64.trim();
  const hasAudio = typeof audioBase64 === "string" && audioBase64.trim();
  const isVideo = action === "videoFinish";
  const mediaCount = [hasImage, hasAudio, isVideo].filter(Boolean).length;
  if (!recipientUserId || mediaCount !== 1) {
    return res.status(400).json({ error: mediaCount > 1 ? "Send only one media file" : "Media file is required" });
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
    replyToId = parsePositiveInt(req.body.replyToId);
    if (!replyToId) {
      return res.status(400).json({ error: "Invalid reply message" });
    }
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

  const duration = parsePositiveInt(durationMs);

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

    return insertMediaMessage(res, [me, them, "image/webp", info.width, info.height, compressed, null, replyToId]);
  }

  if (hasAudio) {
    const buffer = Buffer.from(audioBase64.trim(), "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Invalid audio file" });
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      return res.status(400).json({ error: "Audio file is too large" });
    }

    const storedType = typeof mediaType === "string" && mediaType.startsWith("audio/") ? mediaType : "audio/webm";
    return insertMediaMessage(res, [me, them, storedType, null, null, buffer, duration, replyToId]);
  }

  // Video: move the staged upload into the message row.
  const uploadId = parsePositiveInt(req.body.uploadId);
  if (!uploadId) {
    return res.status(400).json({ error: "Invalid video upload" });
  }

  const storedType = typeof mediaType === "string" && /^video\/(mp4|webm)$/.test(mediaType) ? mediaType : "video/webm";
  const width = Math.min(parsePositiveInt(req.body.width) || 0, MAX_VIDEO_SIDE) || null;
  const height = Math.min(parsePositiveInt(req.body.height) || 0, MAX_VIDEO_SIDE) || null;

  let thumb = null;
  if (typeof req.body.thumbBase64 === "string" && req.body.thumbBase64.trim()) {
    try {
      thumb = await sharp(Buffer.from(req.body.thumbBase64.trim(), "base64"))
        .resize(MAX_VIDEO_SIDE, MAX_VIDEO_SIDE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 70, effort: 4 })
        .toBuffer();
    } catch (err) {
      console.error("[api/file] video thumb sharp error", err);
      thumb = null;
    }
  }

  const { rows: insertRows } = await query(
    `INSERT INTO messages
       (sender_id, recipient_id, content, media_type, media_width, media_height, media_bytes, media_duration_ms, reply_to_id, media_thumb)
     SELECT $1, $2, '', $3, $4, $5, u.bytes, $6, $7, $8
     FROM media_uploads u
     WHERE u.id = $9 AND u.owner_id = $1
     RETURNING id`,
    [me, them, storedType, width, height, duration, replyToId, thumb, uploadId]
  );
  if (!insertRows.length) {
    return res.status(400).json({ error: "Invalid video upload" });
  }
  await query("DELETE FROM media_uploads WHERE id = $1", [uploadId]);

  return respondWithMessage(res, insertRows[0].id);
}

/**
 * GET ?id=<messageId>            whole file (images / audio)
 * GET ?id=<messageId>&part=<n>   4 MB slice of the file (videos); X-Media-Parts / X-Media-Size headers
 * GET ?id=<messageId>&thumb=1    video thumbnail (webp)
 */
async function serveFile(req, res) {
  const idRaw = req.query?.id;
  if (idRaw === undefined || idRaw === null || idRaw === "") {
    return res.status(400).json({ error: "Missing file id" });
  }

  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid file id" });
  }

  const wantsThumb = req.query?.thumb === "1";
  const partRaw = req.query?.part;
  const part = partRaw === undefined ? null : Number(partRaw);
  if (part !== null && (!Number.isInteger(part) || part < 0)) {
    return res.status(400).json({ error: "Invalid file part" });
  }

  let bytesSql = "media_bytes AS bytes";
  const params = [id];
  if (wantsThumb) {
    bytesSql = "media_thumb AS bytes";
  } else if (part !== null) {
    bytesSql = "substring(media_bytes FROM $2::int FOR $3::int) AS bytes";
    params.push(part * FILE_PART_BYTES + 1, FILE_PART_BYTES);
  }

  const { rows } = await query(
    `SELECT sender_id, recipient_id, media_type, octet_length(media_bytes) AS size, ${bytesSql}
     FROM messages WHERE id = $1`,
    params
  );

  if (!rows.length || !rows[0].size || (wantsThumb && !rows[0].bytes)) {
    return res.status(404).json({ error: "File not found" });
  }

  const row = rows[0];
  if (row.sender_id !== req.account.user_id && row.recipient_id !== req.account.user_id) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (part !== null) {
    const parts = Math.ceil(row.size / FILE_PART_BYTES);
    if (part >= parts) {
      return res.status(404).json({ error: "File not found" });
    }
    res.setHeader("X-Media-Size", String(row.size));
    res.setHeader("X-Media-Parts", String(parts));
  }

  res.setHeader("Content-Type", wantsThumb ? "image/webp" : (row.media_type || "image/webp"));
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.status(200).send(row.bytes);
}

async function handler(req, res) {
  if (req.method === "POST") return uploadFile(req, res);
  if (req.method === "GET") return serveFile(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
