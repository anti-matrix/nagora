/**
 * lib/moderation.js — database side of bans and roles.
 * Shared by lib/handlers/rooms.js, the owner shell and scripts/{ban-user,set-role}.mjs.
 * The rules themselves (what a ban list means, who may act on whom) are the
 * pure functions in lib/rooms.js.
 */
import { query } from "./db.js";
import { ROLES, addBans, removeBans, normalizeBans, bannedRooms } from "./rooms.js";

/** One line for the CLI and the owner shell: "@name [role] bans: GLOBAL, POLITICS". */
export function describeBans(account, bans = account.bans) {
  const { all, rooms } = bannedRooms(bans);
  const where = all ? "ALL (every room)" : rooms.length ? rooms.join(", ") : "none";
  return `@${account.username} [${account.role}] bans: ${where}`;
}

const MOD_COLUMNS = "id, username, user_id, showname, bans, role";

/** "@Name " → "Name". */
export function cleanUsername(input) {
  return String(input ?? "").trim().replace(/^@+/, "");
}

/**
 * Case-insensitive lookup. Usernames are unique case-sensitively, so two
 * accounts can differ only by case: an exact match wins, otherwise the name
 * must be unambiguous.
 */
export async function findAccountByUsername(input) {
  const name = cleanUsername(input);
  if (!name) return null;
  const { rows } = await query(
    `SELECT ${MOD_COLUMNS} FROM accounts WHERE lower(username) = lower($1) ORDER BY id`,
    [name]
  );
  if (rows.length <= 1) return rows[0] || null;
  const exact = rows.find(r => r.username === name);
  if (exact) return exact;
  throw new Error(`Ambiguous username "${name}": ${rows.map(r => r.username).join(", ")}`);
}

export async function findAccountByUserId(userId) {
  if (!userId || typeof userId !== "string") return null;
  const { rows } = await query(`SELECT ${MOD_COLUMNS} FROM accounts WHERE user_id = $1`, [userId]);
  return rows[0] || null;
}

async function writeBans(account, bans) {
  const { rows } = await query(
    "UPDATE accounts SET bans = $1 WHERE id = $2 RETURNING bans",
    [normalizeBans(bans), account.id]
  );
  return rows[0].bans;
}

/** Adds `rooms` (room names or "ALL") to the account's bans. Returns the new list. */
export function banAccount(account, rooms) {
  return writeBans(account, addBans(account.bans, rooms));
}

/** Lifts `rooms` from the account's bans; no rooms (or "ALL") clears everything. */
export function unbanAccount(account, rooms) {
  const lifted = normalizeBans(rooms);
  return writeBans(account, removeBans(account.bans, lifted.length ? lifted : ["ALL"]));
}

export async function listBannedAccounts() {
  const { rows } = await query(
    `SELECT ${MOD_COLUMNS} FROM accounts WHERE cardinality(bans) > 0 ORDER BY lower(username)`
  );
  return rows;
}

/** Roles are changed only from scripts/set-role.mjs — never from an HTTP endpoint. */
export async function setAccountRole(account, role) {
  if (!ROLES.includes(role)) throw new Error(`Invalid role "${role}" (use ${ROLES.join(", ")})`);
  const { rows } = await query("UPDATE accounts SET role = $1 WHERE id = $2 RETURNING role", [role, account.id]);
  return rows[0].role;
}

// ── Room nicknames ────────────────────────────────────────────────────────

/** { ROOM: nickname } for one account. */
export async function nicknamesOf(userId) {
  const { rows } = await query("SELECT room, nickname FROM room_nicknames WHERE user_id = $1", [userId]);
  return Object.fromEntries(rows.map(r => [r.room, r.nickname]));
}

/**
 * Sets (value) or clears (null) one account's nickname in one room. `room` and
 * `value` must already be normalized. Returns the previous nickname or null.
 */
export async function writeNickname(userId, room, value, actorUserId) {
  const { rows } = await query("SELECT nickname FROM room_nicknames WHERE user_id = $1 AND room = $2", [userId, room]);
  const previous = rows[0]?.nickname ?? null;
  if (value === null) {
    await query("DELETE FROM room_nicknames WHERE user_id = $1 AND room = $2", [userId, room]);
  } else {
    await query(
      `INSERT INTO room_nicknames (user_id, room, nickname, set_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, room) DO UPDATE SET nickname = EXCLUDED.nickname, set_by = EXCLUDED.set_by, updated_at = now()`,
      [userId, room, value, actorUserId]
    );
  }
  return previous;
}
