import { query, ensureSchema, end } from "../lib/db.js";

async function main() {
  try {
    console.log("[backfill-friends] Ensuring schema...");
    await ensureSchema();

    console.log("[backfill-friends] Backfilling friendships from existing messages...");
    const result = await query(`
      INSERT INTO friendships (user_a, user_b)
      SELECT DISTINCT LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)
      FROM messages
      WHERE sender_id IS NOT NULL AND recipient_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    console.log(`[backfill-friends] Inserted/ignored ${result.rowCount} friendship rows.`);
    await end();
    process.exit(0);
  } catch (err) {
    console.error("[backfill-friends] Error:", err.message);
    await end();
    process.exit(1);
  }
}

main();
