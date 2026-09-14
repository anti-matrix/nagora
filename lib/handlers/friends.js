import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";

async function accountExists(userId) {
  const { rows } = await query("SELECT 1 FROM accounts WHERE user_id = $1", [userId]);
  return rows.length > 0;
}

async function areFriends(me, them) {
  const { rows } = await query(
    `SELECT 1 FROM friendships
     WHERE LEAST(user_a, user_b) = LEAST($1, $2)
       AND GREATEST(user_a, user_b) = GREATEST($1, $2)
     LIMIT 1`,
    [me, them]
  );
  return rows.length > 0;
}

function friendRowToUser(row) {
  return {
    userId: row.user_id,
    username: row.username,
    showname: row.showname || null,
    online: !!row.online,
    lastSeenAt: row.last_seen_at,
  };
}

async function listFriends(req, res) {
  const { rows } = await query(
    `SELECT a.user_id, a.username, a.showname, a.last_seen_at,
            (a.last_seen_at > now() - interval '5 minutes') AS online
     FROM friendships f
     JOIN accounts a ON a.user_id = CASE
       WHEN f.user_a = $1 THEN f.user_b
       ELSE f.user_a
     END
     WHERE $1 IN (f.user_a, f.user_b)
     ORDER BY a.username`,
    [req.account.user_id]
  );
  res.status(200).json({ ok: true, users: rows.map(friendRowToUser) });
}

async function listIncoming(req, res) {
  const { rows } = await query(
    `SELECT fr.id, fr.sender_id, fr.created_at,
            a.username AS sender_username, a.showname AS sender_showname
     FROM friend_requests fr
     JOIN accounts a ON a.user_id = fr.sender_id
     WHERE fr.recipient_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [req.account.user_id]
  );
  res.status(200).json({
    ok: true,
    requests: rows.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      senderUsername: r.sender_username,
      senderShowname: r.sender_showname || null,
      createdAt: r.created_at,
    })),
  });
}

async function listOutgoing(req, res) {
  const { rows } = await query(
    `SELECT fr.id, fr.recipient_id, fr.created_at,
            a.username AS recipient_username, a.showname AS recipient_showname
     FROM friend_requests fr
     JOIN accounts a ON a.user_id = fr.recipient_id
     WHERE fr.sender_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [req.account.user_id]
  );
  res.status(200).json({
    ok: true,
    requests: rows.map(r => ({
      id: r.id,
      recipientId: r.recipient_id,
      recipientUsername: r.recipient_username,
      recipientShowname: r.recipient_showname || null,
      createdAt: r.created_at,
    })),
  });
}

async function getStatus(req, res) {
  const targetUserId = req.query?.targetUserId;
  if (!targetUserId) {
    return res.status(400).json({ error: "Missing target user id" });
  }

  const exists = await accountExists(targetUserId);
  if (!exists) {
    return res.status(400).json({ error: "Invalid target user id" });
  }

  const me = req.account.user_id;
  const them = targetUserId;

  if (await areFriends(me, them)) {
    return res.status(200).json({ ok: true, relationship: "friend" });
  }

  const { rows: incoming } = await query(
    `SELECT 1 FROM friend_requests
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'
     LIMIT 1`,
    [them, me]
  );
  if (incoming.length) {
    return res.status(200).json({ ok: true, relationship: "incoming" });
  }

  const { rows: outgoing } = await query(
    `SELECT 1 FROM friend_requests
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'
     LIMIT 1`,
    [me, them]
  );
  if (outgoing.length) {
    return res.status(200).json({ ok: true, relationship: "outgoing" });
  }

  res.status(200).json({ ok: true, relationship: "none" });
}

async function doSend(req, res) {
  const { targetUserId } = req.body || {};
  const me = req.account.user_id;
  const them = targetUserId;

  if (!them || them === me) {
    return res.status(400).json({ error: "Invalid target user id" });
  }

  const exists = await accountExists(them);
  if (!exists) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  if (await areFriends(me, them)) {
    return res.status(409).json({ error: "You are already friends" });
  }

  const { rows: outgoingRows } = await query(
    `SELECT id FROM friend_requests
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'
     LIMIT 1`,
    [me, them]
  );
  if (outgoingRows.length) {
    return res.status(409).json({ error: "A pending request to this user already exists" });
  }

  const { rows: incomingRows } = await query(
    `SELECT id FROM friend_requests
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'
     LIMIT 1`,
    [them, me]
  );
  if (incomingRows.length) {
    req.body = { action: "accept", targetUserId: them };
    return doAccept(req, res);
  }

  const { rows: insertRows } = await query(
    `INSERT INTO friend_requests (sender_id, recipient_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, recipient_id, created_at`,
    [me, them]
  );
  const row = insertRows[0];

  const { rows: recipientRows } = await query(
    "SELECT username, showname FROM accounts WHERE user_id = $1",
    [row.recipient_id]
  );
  const recipient = recipientRows[0];

  res.status(201).json({
    ok: true,
    request: {
      id: row.id,
      recipientId: row.recipient_id,
      recipientUsername: recipient.username,
      recipientShowname: recipient.showname || null,
      createdAt: row.created_at,
      status: "pending",
    },
  });
}

async function doAccept(req, res) {
  const { targetUserId } = req.body || {};
  const me = req.account.user_id;
  const them = targetUserId;

  const { rows } = await query(
    `UPDATE friend_requests
     SET status = 'accepted'
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'
     RETURNING id`,
    [them, me]
  );
  if (!rows.length) {
    return res.status(400).json({ error: "Friend request not found" });
  }

  await query(
    `INSERT INTO friendships (user_a, user_b)
     VALUES (LEAST($1, $2), GREATEST($1, $2))
     ON CONFLICT DO NOTHING`,
    [me, them]
  );

  const { rows: friendRows } = await query(
    `SELECT user_id, username, showname, last_seen_at,
            (last_seen_at > now() - interval '5 minutes') AS online
     FROM accounts
     WHERE user_id = $1`,
    [them]
  );

  res.status(200).json({
    ok: true,
    friend: friendRows.map(friendRowToUser)[0],
  });
}

async function doDecline(req, res) {
  const { targetUserId } = req.body || {};
  const me = req.account.user_id;
  const them = targetUserId;

  const { rowCount } = await query(
    `UPDATE friend_requests
     SET status = 'declined'
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'`,
    [them, me]
  );
  if (!rowCount) {
    return res.status(400).json({ error: "Friend request not found" });
  }

  res.status(200).json({ ok: true });
}

async function doCancel(req, res) {
  const { targetUserId } = req.body || {};
  const me = req.account.user_id;
  const them = targetUserId;

  const { rowCount } = await query(
    `UPDATE friend_requests
     SET status = 'declined'
     WHERE sender_id = $1 AND recipient_id = $2 AND status = 'pending'`,
    [me, them]
  );
  if (!rowCount) {
    return res.status(400).json({ error: "Friend request not found" });
  }

  res.status(200).json({ ok: true });
}

async function handleGet(req, res) {
  const type = req.query?.type;
  if (!type) {
    return res.status(400).json({ error: "Missing type parameter" });
  }

  switch (type) {
    case "friends":   return listFriends(req, res);
    case "incoming":  return listIncoming(req, res);
    case "outgoing":  return listOutgoing(req, res);
    case "status":    return getStatus(req, res);
    default:          return res.status(400).json({ error: "Invalid type parameter" });
  }
}

async function handlePost(req, res) {
  const { action, targetUserId } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: "Unknown action" });
  }

  if (!targetUserId) {
    return res.status(400).json({ error: "Missing target user id" });
  }
  if (targetUserId === req.account.user_id) {
    return res.status(400).json({ error: "Invalid target user id" });
  }

  switch (action) {
    case "send":    return doSend(req, res);
    case "accept":  return doAccept(req, res);
    case "decline": return doDecline(req, res);
    case "cancel":  return doCancel(req, res);
    default:        return res.status(400).json({ error: "Unknown action" });
  }
}

async function handler(req, res) {
  if (req.method === "GET")  return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
