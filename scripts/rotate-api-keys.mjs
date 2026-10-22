#!/usr/bin/env node
/**
 * scripts/rotate-api-keys.mjs
 *
 * One-time migration: regenerate every account's api_key as a random,
 * non-reversible token.
 *
 * WARNING: this logs everyone out — the `nagora_session` cookie holds the
 * api_key, so rotated keys no longer match and users must log in again.
 * (auth_key is server-only and signs the client token; it is not rotated here.)
 *
 * Safe to re-run; each run produces new keys and logs everyone out again.
 */
import { query, ensureSchema, end } from "../lib/db.js";
import { generateApiKey } from "../lib/apikey.js";

async function main() {
  try {
    console.log("[rotate-api-keys] Ensuring schema...");
    await ensureSchema();

    console.log("[rotate-api-keys] Loading accounts...");
    const { rows } = await query("SELECT id FROM accounts ORDER BY id");

    let rotated = 0;
    for (const { id } of rows) {
      await query(
        "UPDATE accounts SET api_key = $1 WHERE id = $2",
        [generateApiKey(), id]
      );
      rotated++;
    }

    console.log(`[rotate-api-keys] Rotated ${rotated} account(s).`);
    await end();
    process.exit(0);
  } catch (err) {
    console.error("[rotate-api-keys] Error:", err.message);
    await end();
    process.exit(1);
  }
}

main();
