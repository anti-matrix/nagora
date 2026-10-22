import assert from "node:assert/strict";

process.env.API_KEY_SEED ??= "smoke-test-seed";

const { generateApiKey, generateAuthKey } = await import("../lib/apikey.js");
const { hashPassword, verifyPassword } = await import("../lib/password.js");
const { extractApiKey, isFromNagora } = await import("../lib/auth.js");
const { signClientToken, verifyClientToken, sessionId } = await import("../lib/handshake.js");

let passed = 0;
async function ok(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    throw e;
  }
}

console.log("apikey:");
await ok("generateApiKey starts with ngr-", () => {
  const key = generateApiKey();
  assert.ok(key.startsWith("ngr-"), `expected ngr- prefix, got ${key}`);
});
await ok("generateAuthKey is ngr-ath-<sha256 hex>", () => {
  const key = generateAuthKey("ABCDEFGHIJ", generateApiKey());
  assert.match(key, /^ngr-ath-[0-9a-f]{64}$/);
});
await ok("generateAuthKey rejects missing userId", () => {
  assert.throws(() => generateAuthKey(null, generateApiKey()));
});

console.log("password:");
await ok("hashPassword returns salt:hashhex", async () => {
  const stored = await hashPassword("pass1234");
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});
await ok("verifyPassword accepts correct password", async () => {
  const stored = await hashPassword("pass1234");
  assert.equal(await verifyPassword("pass1234", stored), true);
});
await ok("verifyPassword rejects wrong password", async () => {
  const stored = await hashPassword("pass1234");
  assert.equal(await verifyPassword("wrongpass", stored), false);
});

console.log("auth:");
await ok("extractApiKey reads Authorization Bearer", () => {
  const key = extractApiKey({ headers: { authorization: "Bearer secret-key" }, query: {} });
  assert.equal(key, "secret-key");
});
await ok("extractApiKey reads X-API-Key header", () => {
  const key = extractApiKey({ headers: { "x-api-key": "header-key" }, query: {} });
  assert.equal(key, "header-key");
});
await ok("extractApiKey reads query.key", () => {
  const key = extractApiKey({ headers: {}, query: { key: "query-key" } });
  assert.equal(key, "query-key");
});
await ok("isFromNagora accepts same-origin", () => {
  assert.equal(isFromNagora({ headers: { "sec-fetch-site": "same-origin", origin: "https://nagora.app", host: "nagora.app" } }), true);
});
await ok("isFromNagora rejects cross-site", () => {
  assert.equal(isFromNagora({ headers: { "sec-fetch-site": "cross-site", host: "nagora.app" } }), false);
});
await ok("isFromNagora rejects foreign Origin", () => {
  assert.equal(isFromNagora({ headers: { origin: "https://evil.example", host: "nagora.app" } }), false);
});

console.log("handshake:");
await ok("client token round-trips and binds to auth_key", () => {
  const authKey = generateAuthKey("ABCDEFGHIJ", generateApiKey());
  const payload = verifyClientToken(signClientToken({ auth_key: authKey }));
  assert.equal(payload?.sid, sessionId(authKey));
});
await ok("tampered client token is rejected", () => {
  const token = signClientToken({ auth_key: "ngr-ath-x" });
  const [, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sid: "other", iat: 0, exp: 9e9 })).toString("base64url");
  assert.equal(verifyClientToken(`${forged}.${sig}`), null);
});

console.log(`\nAll ${passed} tests passed.`);
