#!/usr/bin/env node
/**
 * scripts/rotate-api-keys.mjs
 *
 * One-time migration: regenerate every account's api_key as a random,
 * non-reversible token.
 *
 * Sessions are NOT affected: the `nagora_session` cookie holds accounts.auth_key,
 * not api_key. To log everyone out, also clear auth_key
 * (`UPDATE accounts SET auth_key = NULL`) — login regenerates it.
 *
 * Safe to re-run; each run produces new keys.
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
