import { requireAccountApiKey } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { kv, NS } from "../lib/redis.js";

function parseQuery(req) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams;
}

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
    `SELECT id, sender_id, recipient_id, content, created_at, read_at,
            media_type, media_width, media_height
     FROM messages
     WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
       AND ($3::int IS NULL OR id < $3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [me, them, before, limit]
  );

  const messages = rows.map(toCamelMessage).reverse();
  const typingKey = `${NS}typing:${them}:${me}`;
  const typingExists = await kv.exists(typingKey);

  res.status(200).json({ ok: true, messages, typing: typingExists === 1 });
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

  const { rows: recipientRows } = await query(
    "SELECT username, user_id FROM accounts WHERE user_id = $1",
    [recipientUserId]
  );
  if (!recipientRows.length) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  const { rows } = await query(
    "INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING id, sender_id, recipient_id, content, created_at, media_type, media_width, media_height",
    [req.account.user_id, recipientUserId, text]
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

export default requireAccountApiKey(handler);
