#!/usr/bin/env node
/**
 * scripts/migrate.mjs
 *
 * Applies the schema (ensureSchema — no longer run on login/signup) and
 * backfills accounts.auth_key for every account that has a user_id + api_key
 * but no auth_key yet. Idempotent: a second run backfills 0.
 *
 * Run BEFORE deploying code that depends on new columns:
 *   node scripts/migrate.mjs   (with DATABASE_URL / POSTGRES_URL set)
 */
import { query, ensureSchema, end } from "../lib/db.js";
import { generateAuthKey } from "../lib/apikey.js";

async function main() {
  try {
    console.log("[migrate] Ensuring schema...");
    await ensureSchema();

    const { rows } = await query(
      `SELECT id, user_id, api_key FROM accounts
       WHERE auth_key IS NULL AND user_id IS NOT NULL AND api_key IS NOT NULL
       ORDER BY id`
    );

    let backfilled = 0;
    for (const { id, user_id, api_key } of rows) {
      await query(
        "UPDATE accounts SET auth_key = $1 WHERE id = $2 AND auth_key IS NULL",
        [generateAuthKey(user_id, api_key), id]
      );
      backfilled++;
    }

    console.log(`[migrate] Backfilled auth_key for ${backfilled} account(s).`);
    await end();
    process.exit(0);
  } catch (err) {
    console.error("[migrate] Error:", err.message);
    await end();
    process.exit(1);
  }
}

main();
