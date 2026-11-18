/**
 * /api/rooms — public rooms (text, images, replies, reactions).
 *
 *   GET  ?type=list                                  rooms + the caller's own bans and role
 *   GET  ?type=messages&room=&[after=|before=]&limit= newest page / new since `after` / older than `before`
 *   GET  ?type=bans&targetUserId=                     (mod/owner) one user's bans
 *   GET  ?type=image&id=                              the bytes of one room image
 *   GET  ?type=info&room=                             description + accounts that posted in the last 24 h
 *   POST { action: "send", room, content, replyToId? }
 *   POST { action: "image", room, imageBase64, replyToId? }  one request, no staging
 *   POST { action: "react", messageId, emoji } / { action: "unreact", messageId }
 *   POST { action: "delete", messageId }              (mod/owner) soft delete; image bytes are dropped
 *   POST { action: "ban" | "unban", targetUserId, rooms }  (mod/owner)
 *
 * Every endpoint that touches a room goes through requireRoomAccess().
 * Bans and roles of OTHER users leave this file only through the mod-only
 * `bans` endpoint and as the boolean `senderIsMod` on messages.
 */
import { requireClientToken, requireRoomAccess } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import { parseReactionEmoji } from "../../lib/messages.js";
import { ROOMS, roomDescriptions, bannedRooms, isMod, canModerate, normalizeBans, invalidRooms } from "../../lib/rooms.js";
import { findAccountByUserId, banAccount, unbanAccount } from "../../lib/moderation.js";
import { LIMITS, MESSAGES, hitWindow, hitCooldown, tooManyRequests } from "../../lib/ratelimit.js";
import { nameColorSql } from "../../lib/cosmetics.js";
import { decodeImageBase64, processMessageImage, ImageInputError } from "../../lib/images.js";

const PAGE_LIMIT = 50;
const MAX_CONTENT_LENGTH = 2000;

function roomReactionsSql(idSql) {
  return `COALESCE((
    SELECT json_agg(json_build_object('userId', r.user_id, 'emoji', r.emoji) ORDER BY r.created_at)
    FROM room_message_reactions r
    WHERE r.message_id = ${idSql}
  ), '[]'::json)`;
}

const ROOM_MESSAGE_SELECT = `
  SELECT m.id, m.room, m.sender_id, m.content, m.created_at, m.deleted_at,
         m.media_type, m.media_width, m.media_height,
         a.username AS sender_username,
         a.showname AS sender_showname,
         (a.avatar_bytes IS NOT NULL) AS sender_has_avatar,
         a.role AS sender_role,
         ${nameColorSql("a")} AS sender_name_color,
         ${roomReactionsSql("m.id")} AS reactions,
         rm.id AS reply_id,
         rm.sender_id AS reply_sender_id,
         rm.content AS reply_content,
         rm.deleted_at AS reply_deleted_at,
         rm.media_type AS reply_media_type,
         ra.username AS reply_sender_username,
         ra.showname AS reply_sender_showname
  FROM room_messages m
  JOIN accounts a ON a.user_id = m.sender_id
  LEFT JOIN room_messages rm ON rm.id = m.reply_to_id
  LEFT JOIN accounts ra ON ra.user_id = rm.sender_id`;

function toRoomMessage(row) {
  // A deleted message keeps its place in the list but carries no content or sender.
  if (row.deleted_at) {
    return { id: row.id, deleted: true, createdAt: row.created_at };
  }

  const message = {
    id: row.id,
    room: row.room,
    content: row.content,
    createdAt: row.created_at,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    senderShowname: row.sender_showname || null,
    senderHasAvatar: !!row.sender_has_avatar,
    senderIsMod: isMod(row.sender_role),
    senderNameColor: row.sender_name_color || null,
    mediaType: row.media_type || null,
    mediaWidth: row.media_width || null,
    mediaHeight: row.media_height || null,
    reactions: row.reactions || [],
  };

  // Same shape as the DM API's replyTo; a deleted original loses its text.
  if (row.reply_id) {
    const replyDeleted = !!row.reply_deleted_at;
    message.replyTo = {
      id: row.reply_id,
      senderId: replyDeleted ? null : row.reply_sender_id,
      senderUsername: replyDeleted ? null : (row.reply_sender_showname || row.reply_sender_username),
      content: replyDeleted ? null : row.reply_content,
      mediaType: replyDeleted ? null : (row.reply_media_type || null),
    };
    if (replyDeleted) message.replyTo.deleted = true;
  }
  return message;
}

function parseId(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function forbidden(res) {
  res.status(403).json({ ok: false, error: "Forbidden" });
}

// ── GET ───────────────────────────────────────────────────────────────────

/** Rooms sidebar header: the room's description. The activity feed is /api/integrations?type=room. */
function getRoomInfo(req, res) {
  const room = requireRoomAccess(req, res, req.query?.room);
  if (!room) return;
  res.status(200).json({ ok: true, room, description: roomDescriptions()[room] || "" });
}

function listRooms(req, res) {
  res.status(200).json({
    ok: true,
    rooms: ROOMS,
    descriptions: roomDescriptions(),
    bans: bannedRooms(req.account.bans),
    role: req.account.role || "user",
    isMod: isMod(req.account.role),
  });
}

async function getMessages(req, res) {
  const room = requireRoomAccess(req, res, req.query?.room);
  if (!room) return;

  const after = parseId(req.query?.after);
  const before = parseId(req.query?.before);
  if (Number.isNaN(after) || Number.isNaN(before)) {
    return res.status(400).json({ ok: false, error: "Invalid message id" });
  }

  let limit = parseInt(req.query?.limit ?? "", 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > PAGE_LIMIT) limit = PAGE_LIMIT;

  if (after) {
    // Polling: what is new, plus the current state (deleted / reactions) of the
    // newest messages the client already has.
    const { rows } = await query(
      `${ROOM_MESSAGE_SELECT}
       WHERE m.room = $1 AND m.id > $2
       ORDER BY m.id ASC
       LIMIT $3`,
      [room, after, limit]
    );
    const { rows: recentRows } = await query(
      `SELECT m.id, (m.deleted_at IS NOT NULL) AS deleted,
              ${roomReactionsSql("m.id")} AS reactions
       FROM room_messages m
       WHERE m.room = $1 AND m.id <= $2
       ORDER BY m.id DESC
       LIMIT $3`,
      [room, after, PAGE_LIMIT]
    );
    const recent = recentRows.map(r => (r.deleted
      ? { id: r.id, deleted: true }
      : { id: r.id, reactions: r.reactions || [] }));
    return res.status(200).json({ ok: true, room, messages: rows.map(toRoomMessage), recent });
  }

  const { rows } = await query(
    `${ROOM_MESSAGE_SELECT}
     WHERE m.room = $1 AND ($2::int IS NULL OR m.id < $2)
     ORDER BY m.id DESC
     LIMIT $3`,
    [room, before, limit]
  );
  res.status(200).json({ ok: true, room, messages: rows.map(toRoomMessage).reverse() });
}

async function getUserBans(req, res) {
  if (!isMod(req.account.role)) return forbidden(res);

  const target = await findAccountByUserId(req.query?.targetUserId);
  if (!target) return res.status(404).json({ ok: false, error: "User not found" });

  res.status(200).json({
    ok: true,
    userId: target.user_id,
    username: target.username,
    bans: bannedRooms(target.bans),
    canModerate: target.user_id !== req.account.user_id && canModerate(req.account.role, target.role),
  });
}

/** Bytes of one room image. Same room gate as reading the room; deleted = gone. */
async function getImage(req, res) {
  const id = parseId(req.query?.id);
  if (!id || Number.isNaN(id)) return res.status(400).json({ ok: false, error: "Invalid message id" });

  const { rows } = await query(
    "SELECT room, media_type, media_bytes, deleted_at FROM room_messages WHERE id = $1",
    [id]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ ok: false, error: "File not found" });
  if (!requireRoomAccess(req, res, row.room)) return;
  if (row.deleted_at || !row.media_bytes) return res.status(404).json({ ok: false, error: "File not found" });

  res.setHeader("Content-Type", row.media_type || "image/webp");
  // Short private cache: a deleted image must not linger for long.
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(200).send(row.media_bytes);
}

// ── POST ──────────────────────────────────────────────────────────────────

/** null when the reply target is fine (or absent), else answers 400 and returns undefined. */
async function parseRoomReply(req, res, room) {
  const replyToId = parseId(req.body?.replyToId);
  if (Number.isNaN(replyToId)) {
    res.status(400).json({ ok: false, error: "Invalid reply message" });
    return undefined;
  }
  if (replyToId) {
    const { rows } = await query("SELECT room, deleted_at FROM room_messages WHERE id = $1", [replyToId]);
    if (!rows.length || rows[0].room !== room || rows[0].deleted_at) {
      res.status(400).json({ ok: false, error: "Invalid reply message" });
      return undefined;
    }
  }
  return replyToId;
}

/**
 * One image per request (the client compresses to <= 1 MB, well under Vercel's
 * 4.5 MB body cap), so there is no staging step: the room gate above covers
 * the whole upload. Counts toward the post limits and the image limits.
 */
async function sendImage(req, res) {
  const room = requireRoomAccess(req, res, req.body?.room);
  if (!room) return;

  const me = req.account.user_id;
  if (!me) return res.status(400).json({ ok: false, error: "Sender account is not initialized" });

  let buffer;
  try {
    buffer = decodeImageBase64(req.body?.imageBase64);
  } catch (err) {
    if (err instanceof ImageInputError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }

  const replyToId = await parseRoomReply(req, res, room);
  if (replyToId === undefined) return;

  const cooldown = await hitCooldown(LIMITS.roomPostCooldown, me);
  if (!cooldown.allowed) return tooManyRequests(res, cooldown, MESSAGES.slowDown);
  const perMinute = await hitWindow(LIMITS.roomPostMinute, me);
  if (!perMinute.allowed) return tooManyRequests(res, perMinute, MESSAGES.roomPost);
  const imageMinute = await hitWindow(LIMITS.roomImageMinute, me);
  if (!imageMinute.allowed) return tooManyRequests(res, imageMinute, MESSAGES.roomImage);
  const imageDay = await hitWindow(LIMITS.roomImageDay, me);
  if (!imageDay.allowed) return tooManyRequests(res, imageDay, MESSAGES.roomImageDay);

  let image;
  try {
    image = await processMessageImage(buffer);
  } catch (err) {
    if (err instanceof ImageInputError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }

  const { rows: inserted } = await query(
    `INSERT INTO room_messages (room, sender_id, content, reply_to_id, media_type, media_width, media_height, media_bytes)
     VALUES ($1, $2, '', $3, $4, $5, $6, $7)
     RETURNING id`,
    [room, me, replyToId, image.mediaType, image.width, image.height, image.bytes]
  );
  const { rows } = await query(`${ROOM_MESSAGE_SELECT} WHERE m.id = $1`, [inserted[0].id]);
  res.status(201).json({ ok: true, message: toRoomMessage(rows[0]) });
}

async function sendMessage(req, res) {
  const room = requireRoomAccess(req, res, req.body?.room);
  if (!room) return;

  const me = req.account.user_id;
  if (!me) return res.status(400).json({ ok: false, error: "Sender account is not initialized" });

  const text = String(req.body?.content ?? "").trim();
  if (!text || text.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ ok: false, error: `Message must be 1 to ${MAX_CONTENT_LENGTH} characters` });
  }

  const replyToId = await parseRoomReply(req, res, room);
  if (replyToId === undefined) return;

  const cooldown = await hitCooldown(LIMITS.roomPostCooldown, me);
  if (!cooldown.allowed) return tooManyRequests(res, cooldown, MESSAGES.slowDown);
  const perMinute = await hitWindow(LIMITS.roomPostMinute, me);
  if (!perMinute.allowed) return tooManyRequests(res, perMinute, MESSAGES.roomPost);

  const { rows: inserted } = await query(
    `INSERT INTO room_messages (room, sender_id, content, reply_to_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [room, me, text, replyToId]
  );
  const { rows } = await query(`${ROOM_MESSAGE_SELECT} WHERE m.id = $1`, [inserted[0].id]);
  res.status(201).json({ ok: true, message: toRoomMessage(rows[0]) });
}

/** Loads a live (not deleted) room message and applies the room gate to its room. */
async function loadMessageInAccessibleRoom(req, res, select = "m.id, m.room, m.sender_id, m.deleted_at") {
  const id = parseId(req.body?.messageId);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ ok: false, error: "Invalid message" });
    return null;
  }
  const { rows } = await query(
    `SELECT ${select} FROM room_messages m JOIN accounts a ON a.user_id = m.sender_id WHERE m.id = $1`,
    [id]
  );
  const msg = rows[0];
  if (!msg) {
    res.status(404).json({ ok: false, error: "Message not found" });
    return null;
  }
  if (!requireRoomAccess(req, res, msg.room)) return null;
  return msg;
}

// Same rules as DM reactions: one emoji per user per message, re-reacting
// replaces it, an empty emoji (or "unreact") removes it.
async function reactToMessage(req, res, { remove }) {
  const msg = await loadMessageInAccessibleRoom(req, res);
  if (!msg) return;
  if (msg.deleted_at) return res.status(404).json({ ok: false, error: "Message not found" });

  const { valid, emoji } = remove ? { valid: true, emoji: null } : parseReactionEmoji(req.body?.emoji);
  if (!valid) return res.status(400).json({ ok: false, error: "Invalid emoji" });

  const me = req.account.user_id;
  const verdict = await hitWindow(LIMITS.roomReact, me);
  if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.roomReact);

  if (emoji) {
    await query(
      `INSERT INTO room_message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
      [msg.id, me, emoji]
    );
  } else {
    await query("DELETE FROM room_message_reactions WHERE message_id = $1 AND user_id = $2", [msg.id, me]);
  }

  const { rows: [out] } = await query(`SELECT ${roomReactionsSql("$1::int")} AS reactions`, [msg.id]);
  res.status(200).json({ ok: true, messageId: msg.id, reactions: out.reactions });
}

async function deleteMessage(req, res) {
  if (!isMod(req.account.role)) return forbidden(res);

  const msg = await loadMessageInAccessibleRoom(req, res, "m.id, m.room, m.sender_id, m.deleted_at, a.role AS sender_role");
  if (!msg) return;

  // A mod may remove their own messages and those of plain users; the owner anyone's.
  const own = msg.sender_id === req.account.user_id;
  if (!own && !canModerate(req.account.role, msg.sender_role)) return forbidden(res);

  await query(
    // The image bytes go too, so the space is freed (reusable by Postgres).
    "UPDATE room_messages SET deleted_at = now(), deleted_by = $2, media_bytes = NULL WHERE id = $1 AND deleted_at IS NULL",
    [msg.id, req.account.user_id]
  );
  res.status(200).json({ ok: true, messageId: msg.id, deleted: true });
}

async function moderateBans(req, res, { lift }) {
  if (!isMod(req.account.role)) return forbidden(res);

  const { targetUserId, rooms } = req.body || {};
  const bad = invalidRooms(rooms);
  if (bad.length) {
    return res.status(400).json({ ok: false, error: `Unknown room: ${bad.join(", ")}` });
  }
  const names = normalizeBans(rooms);
  if (!lift && !names.length) {
    return res.status(400).json({ ok: false, error: "Missing rooms" });
  }

  const target = await findAccountByUserId(targetUserId);
  if (!target) return res.status(404).json({ ok: false, error: "User not found" });

  // Enforced here regardless of what the client shows.
  if (target.user_id === req.account.user_id || !canModerate(req.account.role, target.role)) {
    return forbidden(res);
  }

  const bans = lift ? await unbanAccount(target, names) : await banAccount(target, names);
  console.log(`[api/rooms] ${req.account.username} ${lift ? "unbanned" : "banned"} ${target.username}: [${names.join(",") || "ALL"}] -> [${bans.join(",")}]`);
  res.status(200).json({ ok: true, userId: target.user_id, bans: bannedRooms(bans) });
}

// ── Dispatch ──────────────────────────────────────────────────────────────

async function dispatch(req, res) {
  if (req.method === "GET") {
    const type = req.query?.type;
    if (type === "list") return listRooms(req, res);
    if (type === "messages") return getMessages(req, res);
    if (type === "bans") return getUserBans(req, res);
    if (type === "image") return getImage(req, res);
    if (type === "info") return getRoomInfo(req, res);
    return res.status(400).json({ ok: false, error: "Invalid type parameter" });
  }

  if (req.method === "POST") {
    const action = req.body?.action;
    if (action === "send") return sendMessage(req, res);
    if (action === "image") return sendImage(req, res);
    if (action === "react") return reactToMessage(req, res, { remove: false });
    if (action === "unreact") return reactToMessage(req, res, { remove: true });
    if (action === "delete") return deleteMessage(req, res);
    if (action === "ban") return moderateBans(req, res, { lift: false });
    if (action === "unban") return moderateBans(req, res, { lift: true });
    return res.status(400).json({ ok: false, error: "Unknown action" });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handler(req, res) {
  try {
    return await dispatch(req, res);
  } catch (err) {
    console.error("[api/rooms]", err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export default requireClientToken(handler);
