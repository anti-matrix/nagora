#!/usr/bin/env node
/**
 * scripts/gennagkey.js — Generate the API key for /api/logs and /api/shell
 *
 * The key is produced with the strenc mixing scheme (lib/strenc.js).
 * The accepted key is set on Vercel as the NAGORA_API_KEY env var;
 * server verification is in lib/auth.js.
 *
 * Usage:
 *   node scripts/gennagkey.js                        # interactive prompt
 *   node scripts/gennagkey.js "plaintext"            # from CLI arg
 *   node scripts/gennagkey.js --check <key>          # verify against NAGORA_API_KEY env var
 */

import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { doubleEncrypt } from "../lib/strenc.js";

function hashKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

function printKey(plaintext, key) {
  console.log("=".repeat(60));
  console.log("API Key generated (strenc double-encrypt)");
  console.log("=".repeat(60));
  console.log(`Plaintext : ${plaintext}`);
  console.log(`Layer 1   : ${key.slice(0, 7)}`);
  console.log(`Layer 2   : ${key.slice(7, 14)}`);
  console.log(`Random    : ${key.slice(14)}`);
  console.log(`API Key   : ${key}`);
  console.log(`SHA-256   : ${hashKey(key)}`);
  console.log("");
  console.log("Send it as header: Authorization: Bearer <key>");
  console.log("(or X-API-Key: <key>)");
  console.log("");
  console.log("Deploy steps:");
  console.log("  1. Vercel > Settings > Environment Variables > NAGORA_API_KEY = <key>");
  console.log("  2. Redeploy so api/shell.js and api/logs.js pick it up");
}

async function main() {
  const args = process.argv.slice(2);
  const checkIdx = args.indexOf("--check");

  if (checkIdx !== -1) {
    const key = args[checkIdx + 1];
    if (!key) {
      console.error("Usage: node scripts/gennagkey.js --check <key>");
      process.exit(1);
    }
    const accepted = process.env.NAGORA_API_KEY;
    if (!accepted) {
      console.error("NAGORA_API_KEY env var not set — cannot check.");
      process.exit(1);
    }
    const match = hashKey(key) === hashKey(accepted);
    console.log(match
      ? "Valid key — matches NAGORA_API_KEY env var."
      : "Invalid key — does not match NAGORA_API_KEY env var.");
    process.exit(match ? 0 : 1);
  }

  let plaintext = args.find(a => !a.startsWith("-"));
  if (!plaintext) {
    const rl = createInterface({ input: stdin, output: stdout });
    plaintext = (await rl.question("Plaintext (leave empty for default 'nagora'): ")).trim();
    rl.close();
    if (!plaintext) plaintext = "nagora";
  }

  printKey(plaintext, "ngr-" + doubleEncrypt(plaintext));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
