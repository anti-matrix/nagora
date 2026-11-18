/**
 * /api/owner — the owner DASHBOARD. Every request: client token + role "owner",
 * checked here from the database row, whatever the client shows. Mods and
 * users get 403 on everything.
 *
 *   GET  ?type=bans                       every account with a ban
 *   GET  ?type=lookup&username=           one account (case-insensitive, "@" tolerated)
 *   GET  ?type=reserved                   reserved_usernames
 *   POST { action: "ban", username, rooms }      rooms: room names or ["ALL"]
 *   POST { action: "unban", username, rooms? }   no rooms / ["ALL"] lifts everything
 *   POST { action: "reserve" | "unreserve", username }
 *   GET  ?type=nicknames                  every room nickname
 *   POST { action: "setNickname", username, room, nickname }   "" / null removes it
 *
 * Bans are written through lib/moderation.js (normalizeBans), the same data
 * the room gate reads, so a ban reaches the user on their next room request.
 */
import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import { ROOMS, isOwner, canModerate, bannedRooms, normalizeBans, invalidRooms, normalizeRoom, normalizeNickname } from "../../lib/rooms.js";
import { findAccountByUsername, banAccount, unbanAccount, listBannedAccounts, writeNickname } from "../../lib/moderation.js";
import { normalizeReservedUsername } from "../../lib/validate.js";

function publicAccount(a, actor) {
  return {
    userId: a.user_id,
    username: a.username,
    showname: a.showname || null,
    role: a.role,
    bans: bannedRooms(a.bans),
    canModerate: a.user_id !== actor.user_id && canModerate(actor.role, a.role),
  };
}

/** The account, or null after answering 400/404/409. */
async function targetAccount(res, username) {
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ ok: false, error: "Missing username" });
    return null;
  }
  try {
    const account = await findAccountByUsername(username);
    if (!account) res.status(404).json({ ok: false, error: "User not found" });
    return account;
  } catch (err) {
    if (/^Ambiguous username/.test(err.message)) {
      res.status(409).json({ ok: false, error: "Ambiguous username: type the exact case" });
      return null;
    }
    throw err;
  }
}

async function listBans(req, res) {
  const rows = await listBannedAccounts();
  res.status(200).json({ ok: true, rooms: ROOMS, accounts: rows.map(a => publicAccount(a, req.account)) });
}

async function lookup(req, res) {
  const account = await targetAccount(res, req.query?.username);
  if (!account) return;
  res.status(200).json({ ok: true, rooms: ROOMS, account: publicAccount(account, req.account) });
}

async function listReserved(req, res) {
  const { rows } = await query("SELECT username FROM reserved_usernames ORDER BY username");
  res.status(200).json({ ok: true, usernames: rows.map(r => r.username) });
}

async function changeBans(req, res, { lift }) {
  const rooms = req.body?.rooms ?? [];
  const bad = invalidRooms(rooms);
  if (bad.length) return res.status(400).json({ ok: false, error: `Unknown room: ${bad.join(", ")}` });
  const names = normalizeBans(rooms);
  if (!lift && !names.length) return res.status(400).json({ ok: false, error: "Missing rooms" });

  const target = await targetAccount(res, req.body?.username);
  if (!target) return;
  // The owner cannot act on themselves or on another owner.
  if (target.user_id === req.account.user_id || !canModerate(req.account.role, target.role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const bans = lift ? await unbanAccount(target, names) : await banAccount(target, names);
  console.log(`[api/owner] ${req.account.username} ${lift ? "unbanned" : "banned"} ${target.username}: [${names.join(",") || "ALL"}] -> [${bans.join(",")}]`);
  res.status(200).json({ ok: true, account: publicAccount({ ...target, bans }, req.account) });
}

async function reserve(req, res) {
  const { name, error } = normalizeReservedUsername(req.body?.username);
  if (error) return res.status(400).json({ ok: false, error });

  const { rows: taken } = await query("SELECT 1 FROM accounts WHERE lower(username) = $1", [name]);
  if (taken.length) return res.status(409).json({ ok: false, error: "Username belongs to an existing account" });

  const { rowCount } = await query(
    "INSERT INTO reserved_usernames (username) VALUES ($1) ON CONFLICT (username) DO NOTHING",
    [name]
  );
  if (!rowCount) return res.status(409).json({ ok: false, error: "Username already reserved" });
  console.log(`[api/owner] ${req.account.username} reserved username "${name}"`);
  res.status(201).json({ ok: true, username: name });
}

async function unreserve(req, res) {
  const name = String(req.body?.username ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!name) return res.status(400).json({ ok: false, error: "Missing username" });
  const { rowCount } = await query("DELETE FROM reserved_usernames WHERE username = $1", [name]);
  if (!rowCount) return res.status(404).json({ ok: false, error: "Not reserved" });
  console.log(`[api/owner] ${req.account.username} removed reserved username "${name}"`);
  res.status(200).json({ ok: true, username: name });
}

async function listNicknames(req, res) {
  const { rows } = await query(
    `SELECT n.user_id, a.username, a.showname, n.room, n.nickname, n.updated_at
     FROM room_nicknames n JOIN accounts a ON a.user_id = n.user_id
     ORDER BY lower(a.username), n.room`
  );
  res.status(200).json({
    ok: true,
    rooms: ROOMS,
    nicknames: rows.map(r => ({
      userId: r.user_id, username: r.username, showname: r.showname || null,
      room: r.room, nickname: r.nickname, updatedAt: r.updated_at,
    })),
  });
}

/** The owner may add, change or remove the nickname of any account in any room. */
async function setNickname(req, res) {
  const room = normalizeRoom(req.body?.room);
  if (!room) return res.status(400).json({ ok: false, error: "Unknown room" });
  const { value, error } = normalizeNickname(req.body?.nickname);
  if (error) return res.status(400).json({ ok: false, error });
  const target = await targetAccount(res, req.body?.username);
  if (!target) return;

  const previous = await writeNickname(target.user_id, room, value, req.account.user_id);
  console.log(`[api/owner] ${req.account.username} set nickname of ${target.username} in ${room}: ${JSON.stringify(previous)} -> ${JSON.stringify(value)}`);
  res.status(200).json({ ok: true, username: target.username, room, nickname: value });
}

async function dispatch(req, res) {
  // The security check. Hiding the DASHBOARD button on the client is cosmetic.
  if (!isOwner(req.account.role)) return res.status(403).json({ ok: false, error: "Forbidden" });

  if (req.method === "GET") {
    const type = req.query?.type;
    if (type === "bans") return listBans(req, res);
    if (type === "lookup") return lookup(req, res);
    if (type === "reserved") return listReserved(req, res);
    if (type === "nicknames") return listNicknames(req, res);
    return res.status(400).json({ ok: false, error: "Invalid type parameter" });
  }
  if (req.method === "POST") {
    const action = req.body?.action;
    if (action === "ban") return changeBans(req, res, { lift: false });
    if (action === "unban") return changeBans(req, res, { lift: true });
    if (action === "reserve") return reserve(req, res);
    if (action === "unreserve") return unreserve(req, res);
    if (action === "setNickname") return setNickname(req, res);
    return res.status(400).json({ ok: false, error: "Unknown action" });
  }
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handler(req, res) {
  try {
    return await dispatch(req, res);
  } catch (err) {
    console.error("[api/owner]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export default requireClientToken(handler);
