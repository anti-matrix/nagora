/**
 * lib/messages.js — shared message row shape for messages.js / file.js.
 * media_bytes is never selected here.
 */

/** JSON array of {userId, emoji} for the message id expression `idSql`. */
export function reactionsSql(idSql) {
  return `COALESCE((
    SELECT json_agg(json_build_object('userId', r.user_id, 'emoji', r.emoji) ORDER BY r.created_at)
    FROM message_reactions r
    WHERE r.message_id = ${idSql}
  ), '[]'::json)`;
}

export const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.recipient_id, m.content, m.created_at, m.read_at,
         m.media_type, m.media_width, m.media_height, m.media_duration_ms, m.reply_to_id,
         ${reactionsSql("m.id")} AS reactions,
         rm.id AS reply_id,
         rm.sender_id AS reply_sender_id,
         rm.content AS reply_content,
         rm.media_type AS reply_media_type,
         ra.username AS reply_sender_username,
         ra.showname AS reply_sender_showname
  FROM messages m
  LEFT JOIN messages rm ON rm.id = m.reply_to_id
  LEFT JOIN accounts ra ON ra.user_id = rm.sender_id`;

export function toCamelMessage(row) {
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
    mediaDurationMs: row.media_duration_ms || null,
    reactions: row.reactions || [],
  };

  if (replyTo) message.replyTo = replyTo;
  return message;
}

/**
 * The caption sent with an image (DM and room): trimmed text, "" when there
 * is none. A caption has the same limit as a text message in the same place:
 * pass that limit as maxLength (rooms: 2000; DMs: none, like DM text).
 * Returns { valid, text }; valid is false only when it is too long.
 * Anything that is not a string counts as no caption.
 */
export function parseCaption(raw, maxLength = Infinity) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > maxLength) return { valid: false, text: "" };
  return { valid: true, text };
}

// A single emoji: pictographs plus the joiners/modifiers/keycaps/tags that build sequences.
const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]+$/u;
const EMOJI_BASE_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;
const MAX_EMOJI_LENGTH = 32;

/**
 * Reaction emoji from a request body. Returns { valid, emoji } where emoji is
 * null for "remove my reaction" (null / empty input).
 */
export function parseReactionEmoji(raw) {
  const emoji = raw == null || raw === "" ? null : String(raw);
  if (emoji && (emoji.length > MAX_EMOJI_LENGTH || !EMOJI_RE.test(emoji) || !EMOJI_BASE_RE.test(emoji))) {
    return { valid: false, emoji: null };
  }
  return { valid: true, emoji };
}
