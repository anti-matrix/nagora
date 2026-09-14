import assert from "node:assert/strict";
import { generateApiKey } from "../lib/apikey.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { extractApiKey } from "../lib/auth.js";

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    throw e;
  }
}

console.log("apikey:");
ok("generateApiKey starts with ngr-", () => {
  const key = generateApiKey();
  assert.ok(key.startsWith("ngr-"), `expected ngr- prefix, got ${key}`);
});

console.log("password:");
ok("hashPassword returns salt:hashhex", async () => {
  const stored = await hashPassword("pass1234");
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});
ok("verifyPassword accepts correct password", async () => {
  const stored = await hashPassword("pass1234");
  assert.equal(await verifyPassword("pass1234", stored), true);
});
ok("verifyPassword rejects wrong password", async () => {
  const stored = await hashPassword("pass1234");
  assert.equal(await verifyPassword("wrongpass", stored), false);
});

console.log("auth:");
ok("extractApiKey reads Authorization Bearer", () => {
  const key = extractApiKey({ headers: { authorization: "Bearer secret-key" }, query: {} });
  assert.equal(key, "secret-key");
});
ok("extractApiKey reads X-API-Key header", () => {
  const key = extractApiKey({ headers: { "x-api-key": "header-key" }, query: {} });
  assert.equal(key, "header-key");
});
ok("extractApiKey reads query.key", () => {
  const key = extractApiKey({ headers: {}, query: { key: "query-key" } });
  assert.equal(key, "query-key");
});

console.log(`\nAll ${passed} tests passed.`);
