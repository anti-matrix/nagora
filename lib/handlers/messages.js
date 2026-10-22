import { requireClientToken } from "../../lib/auth.js";
import { query, areFriends, presenceStatusSql } from "../../lib/db.js";
import { kv, NS } from "../../lib/redis.js";
import { MESSAGE_SELECT, toCamelMessage, reactionsSql } from "../../lib/messages.js";

function parseQuery(req) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams;
}

async function getHistory(req, res) {
  const params = parseQuery(req);
  const withUserId = params.get("with");
  if (!withUserId) {
    return res.status(400).json({ error: "Missing 'with' parameter" });
  }

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
  }

  let before = null;
  const beforeRaw = params.get("before");
  if (beforeRaw) {
    const parsed = parseInt(beforeRaw, 10);
    if (Number.isFinite(parsed)) before = parsed;
  }

  let limit = parseInt(params.get("limit") ?? "", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  const me = req.account.user_id;
  const them = withUserId;

  const { rows } = await query(
    `${MESSAGE_SELECT}
     WHERE ((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))
       AND ($3::int IS NULL OR m.id < $3)
     ORDER BY m.created_at DESC
     LIMIT $4`,
    [me, them, before, limit]
  );

  const messages = rows.map(toCamelMessage).reverse();
  const typingKey = `${NS}typing:${them}:${me}`;
  const typingExists = await kv.exists(typingKey);

  const { rows: peerRows } = await query(
    `SELECT ${presenceStatusSql()} AS status
     FROM accounts
     WHERE user_id = $1`,
    [them]
  );
  const recipientStatus = peerRows[0]?.status || "offline";
  const recipientOnline = recipientStatus === "online";

  res.status(200).json({ ok: true, messages, typing: typingExists === 1, recipientOnline, recipientStatus });
}

async function sendMessage(req, res) {
  const { recipientUserId, content } = req.body || {};
  const text = String(content ?? "").trim();

  if (!text) {
    return res.status(400).json({ error: "Message content is required" });
  }

  if (!req.account.user_id) {
    return res.status(400).json({ error: "Sender account is not initialized" });
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

  const { rows: insertRows } = await query(
    `INSERT INTO messages
       (sender_id, recipient_id, content, reply_to_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sender_id, recipient_id, content, created_at, reply_to_id`,
    [me, them, text, replyToId]
  );

  const { rows } = await query(
    `${MESSAGE_SELECT}
     WHERE m.id = $1`,
    [insertRows[0].id]
  );

  res.status(201).json({ ok: true, message: toCamelMessage(rows[0]) });
}

async function markRead(req, res) {
  const { with: withUserId } = req.body || {};

  const { rowCount } = await query(
    "UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL",
    [req.account.user_id, withUserId]
  );

  res.status(200).json({ ok: true, marked: rowCount });
}

// A single emoji: pictographs plus the joiners/modifiers/keycaps/tags that build sequences.
const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️⃣]+$/u;
const EMOJI_BASE_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;
const MAX_EMOJI_LENGTH = 32;

async function reactToMessage(req, res) {
  const { messageId, emoji: rawEmoji } = req.body || {};
  const id = parseInt(messageId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid message" });
  }

  const emoji = rawEmoji == null || rawEmoji === "" ? null : String(rawEmoji);
  if (emoji && (emoji.length > MAX_EMOJI_LENGTH || !EMOJI_RE.test(emoji) || !EMOJI_BASE_RE.test(emoji))) {
    return res.status(400).json({ error: "Invalid emoji" });
  }

  const me = req.account.user_id;
  const { rows } = await query("SELECT sender_id, recipient_id FROM messages WHERE id = $1", [id]);
  const msg = rows[0];
  if (!msg || (msg.sender_id !== me && msg.recipient_id !== me)) {
    return res.status(404).json({ error: "Message not found" });
  }

  const them = msg.sender_id === me ? msg.recipient_id : msg.sender_id;
  if (!(await areFriends(me, them))) {
    return res.status(403).json({ error: "You must be friends to react" });
  }

  if (emoji) {
    await query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
      [id, me, emoji]
    );
  } else {
    await query("DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2", [id, me]);
  }

  const { rows: [out] } = await query(`SELECT ${reactionsSql("$1::int")} AS reactions`, [id]);
  res.status(200).json({ ok: true, messageId: id, reactions: out.reactions });
}

async function handler(req, res) {
  if (req.method === "GET") return getHistory(req, res);

  if (req.method === "POST") {
    const { action } = req.body || {};
    if (action === "send") return sendMessage(req, res);
    if (action === "read") return markRead(req, res);
    if (action === "react") return reactToMessage(req, res);
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
