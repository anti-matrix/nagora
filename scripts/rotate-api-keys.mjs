#!/usr/bin/env node
/**
 * scripts/rotate-api-keys.mjs
 *
 * One-time migration: regenerate every account's api_key as a random,
 * non-reversible token.
 *
 * WARNING / AVISO: Running this script invalidates every existing session.
 * The `nagora_session` HttpOnly cookie stores the current api_key. After the
 * rotation, `requireAccountApiKey` and `requireClientToken` will not find a
 * matching row -> 401 -> the frontend redirects to index.html. Every user must
 * log in again to receive a fresh random key.
 *
 * The script is safe to re-run, but each run produces new keys and logs
 * everyone out again.
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
