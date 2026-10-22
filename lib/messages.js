/**
 * lib/messages.js — shared message row shape for messages.js / file.js.
 * media_bytes is never selected here.
 */

export const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.recipient_id, m.content, m.created_at, m.read_at,
         m.media_type, m.media_width, m.media_height, m.media_duration_ms, m.reply_to_id,
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
  };

  if (replyTo) message.replyTo = replyTo;
  return message;
}
