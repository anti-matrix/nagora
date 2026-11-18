/**
 * lib/rooms.js — public rooms: names, bans and roles.
 * Pure functions only: no database, no Redis, no req/res.
 */

/**
 * Single source of truth for the public rooms. Add an entry here to add a room;
 * `description` is the one line shown in the rooms sidebar (pt-BR).
 */
export const ROOM_REGISTRY = [
  { name: "GLOBAL", description: "Conversa geral, sobre qualquer assunto." },
  { name: "POLITICS", description: "Política e atualidades." },
  { name: "AKSHUALLY", description: "O mesmo que Global, só que sério." },
];

export const ROOMS = ROOM_REGISTRY.map(r => r.name);

/** { GLOBAL: "…", … } */
export function roomDescriptions() {
  return Object.fromEntries(ROOM_REGISTRY.map(r => [r.name, r.description]));
}

// ── Room nicknames ("apelidos") ──────────────────────────────────────────

/** Max nickname length in characters (code points); the table CHECK says the same. */
export const NICKNAME_MAX = 20;

// Control characters, zero-width characters and bidi overrides/isolates.
const NICKNAME_STRIP = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * { value } with the cleaned nickname (null = clear it), or { error }.
 * Trimmed, inner whitespace collapsed to one space; "" / null / undefined clears.
 */
export function normalizeNickname(input) {
  if (input === null || input === undefined) return { value: null };
  if (typeof input !== "string") return { error: "Invalid nickname" };
  const value = input.normalize("NFC").replace(NICKNAME_STRIP, "").replace(/\s+/g, " ").trim();
  if (!value) return { value: null };
  if ([...value].length > NICKNAME_MAX) return { error: `Nickname must be ${NICKNAME_MAX} characters or less` };
  return { value };
}

/** Ban entry meaning "every room, including rooms added later". */
export const ALL = "ALL";

export const ROLES = ["user", "mod", "owner"];

function toList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") return input.split(",");
  return [];
}

/** Room name as stored ("GLOBAL"), or null when it is not a room. */
export function normalizeRoom(input) {
  if (typeof input !== "string") return null;
  const name = input.trim().toUpperCase();
  return ROOMS.includes(name) ? name : null;
}

/** Uppercase, dedupe, drop anything that is not a room or "ALL", sorted. */
export function normalizeBans(input) {
  const out = new Set();
  for (const raw of toList(input)) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().toUpperCase();
    if (name === ALL || ROOMS.includes(name)) out.add(name);
  }
  return [...out].sort();
}

/** Entries of `input` that are neither a room nor "ALL" (for strict validation). */
export function invalidRooms(input) {
  return toList(input)
    .map(raw => (typeof raw === "string" ? raw.trim() : String(raw)))
    .filter(name => name && name.toUpperCase() !== ALL && !ROOMS.includes(name.toUpperCase()));
}

export function isBannedFrom(bans, room) {
  const list = normalizeBans(bans);
  return list.includes(ALL) || list.includes(String(room ?? "").toUpperCase());
}

/** { all, rooms } — `rooms` lists every room when the ban is ALL. */
export function bannedRooms(bans) {
  const list = normalizeBans(bans);
  const all = list.includes(ALL);
  return { all, rooms: all ? [...ROOMS] : list };
}

/** Bans after adding `rooms`. */
export function addBans(bans, rooms) {
  return normalizeBans([...normalizeBans(bans), ...normalizeBans(rooms)]);
}

/**
 * Bans after lifting `rooms`. Lifting "ALL" clears everything. Lifting one room
 * from an ALL ban leaves the user banned from every other room.
 */
export function removeBans(bans, rooms) {
  const current = normalizeBans(bans);
  const lifted = normalizeBans(rooms);
  if (lifted.includes(ALL)) return [];
  const expanded = current.includes(ALL) ? [...ROOMS] : current;
  return normalizeBans(expanded.filter(name => !lifted.includes(name)));
}

export function isMod(role) {
  return role === "mod" || role === "owner";
}

/** The owner DASHBOARD (/api/owner) is for role "owner" only; mods and users get 403. */
export function isOwner(role) {
  return role === "owner";
}

/**
 * Owner acts on anyone but another owner; mod acts only on plain users.
 * Nobody acts on themselves: equal roles never pass, and callers also compare ids.
 */
export function canModerate(actorRole, targetRole) {
  if (actorRole === "owner") return targetRole !== "owner";
  if (actorRole === "mod") return targetRole === "user";
  return false;
}
