#!/usr/bin/env node
/**
 * scripts/set-role.mjs — the only way to change an account's role.
 *
 *   node scripts/set-role.mjs <username> <user|mod|owner>
 *   node scripts/set-role.mjs set-role <username> <user|mod|owner>   (same thing)
 *
 * Usernames are case-insensitive and may start with "@". Needs DATABASE_URL
 * (or POSTGRES_URL). Exits 1 on an unknown user or an invalid role.
 */
import { end } from "../lib/db.js";
import { ROLES } from "../lib/rooms.js";
import { findAccountByUsername, setAccountRole } from "../lib/moderation.js";

const USAGE = `Usage: node scripts/set-role.mjs <username> <${ROLES.join("|")}>`;

class UsageError extends Error {}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "set-role") args.shift();
  const [username, roleArg] = args;
  if (!username || !roleArg) throw new UsageError(USAGE);

  const role = roleArg.toLowerCase();
  if (!ROLES.includes(role)) throw new UsageError(`Invalid role: ${roleArg}\n${USAGE}`);

  const account = await findAccountByUsername(username);
  if (!account) throw new UsageError(`Unknown user: ${username}`);

  const saved = await setAccountRole(account, role);
  console.log(`[set-role] @${account.username}: ${account.role} -> ${saved}`);
}

try {
  await main();
  await end();
  process.exit(0);
} catch (err) {
  console.error(err instanceof UsageError ? err.message : `[set-role] Error: ${err.message}`);
  await end();
  process.exit(1);
}
