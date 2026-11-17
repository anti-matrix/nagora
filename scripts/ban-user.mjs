#!/usr/bin/env node
/**
 * scripts/ban-user.mjs — room bans from the command line.
 *
 *   node scripts/ban-user.mjs ban <username> <ROOM[,ROOM...]>   rooms or ALL
 *   node scripts/ban-user.mjs unban <username> [ROOM|ALL]       no room = lift everything
 *   node scripts/ban-user.mjs list [username]                   everyone banned, or one user
 *
 * Usernames are case-insensitive and may start with "@". Needs DATABASE_URL
 * (or POSTGRES_URL). Exits 1 on an unknown user or an invalid room.
 */
import { end } from "../lib/db.js";
import { ROOMS, normalizeBans, invalidRooms } from "../lib/rooms.js";
import {
  findAccountByUsername, banAccount, unbanAccount, listBannedAccounts,
  describeBans as describe,
} from "../lib/moderation.js";

const USAGE = [
  "Usage:",
  "  node scripts/ban-user.mjs ban <username> <ROOM[,ROOM...]>",
  "  node scripts/ban-user.mjs unban <username> [ROOM|ALL]",
  "  node scripts/ban-user.mjs list [username]",
  `Rooms: ${ROOMS.join(", ")}, ALL`,
].join("\n");

class UsageError extends Error {}

/** Room arguments may be comma- or space-separated: "GLOBAL,POLITICS" or "GLOBAL POLITICS". */
function parseRooms(args) {
  const raw = args.join(",").split(",").map(s => s.trim()).filter(Boolean);
  const bad = invalidRooms(raw);
  if (bad.length) throw new UsageError(`Invalid room: ${bad.join(", ")} (valid: ${ROOMS.join(", ")}, ALL)`);
  return normalizeBans(raw);
}

async function requireAccount(username) {
  if (!username) throw new UsageError(USAGE);
  const account = await findAccountByUsername(username);
  if (!account) throw new UsageError(`Unknown user: ${username}`);
  return account;
}

async function main() {
  const [command, username, ...rest] = process.argv.slice(2);

  if (command === "ban") {
    const rooms = parseRooms(rest);
    if (!rooms.length) throw new UsageError(`ban needs at least one room.\n${USAGE}`);
    const account = await requireAccount(username);
    const bans = await banAccount(account, rooms);
    console.log(`[ban-user] banned. ${describe(account, bans)}`);
    return;
  }

  if (command === "unban") {
    const rooms = parseRooms(rest);
    const account = await requireAccount(username);
    const bans = await unbanAccount(account, rooms);
    console.log(`[ban-user] unbanned. ${describe(account, bans)}`);
    return;
  }

  if (command === "list") {
    if (username) {
      console.log(`[ban-user] ${describe(await requireAccount(username))}`);
      return;
    }
    const banned = await listBannedAccounts();
    if (!banned.length) console.log("[ban-user] nobody is banned.");
    for (const account of banned) console.log(`[ban-user] ${describe(account)}`);
    return;
  }

  throw new UsageError(USAGE);
}

try {
  await main();
  await end();
  process.exit(0);
} catch (err) {
  console.error(err instanceof UsageError ? err.message : `[ban-user] Error: ${err.message}`);
  await end();
  process.exit(1);
}
