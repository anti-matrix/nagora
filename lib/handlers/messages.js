import { requireClientToken } from "../../lib/auth.js";
import { query, areFriends } from "../../lib/db.js";
import { kv, NS } from "../../lib/redis.js";
import { MESSAGE_SELECT, toCamelMessage } from "../../lib/messages.js";

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
    `SELECT (last_seen_at > now() - interval '1 minute') AS online
     FROM accounts
     WHERE user_id = $1`,
    [them]
  );
  const recipientOnline = peerRows.length > 0 && !!peerRows[0].online;

  res.status(200).json({ ok: true, messages, typing: typingExists === 1, recipientOnline });
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

async function handler(req, res) {
  if (req.method === "GET") return getHistory(req, res);

  if (req.method === "POST") {
    const { action } = req.body || {};
    if (action === "send") return sendMessage(req, res);
    if (action === "read") return markRead(req, res);
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
