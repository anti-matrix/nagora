import assert from "node:assert/strict";

process.env.API_KEY_SEED ??= "smoke-test-seed";

const { generateApiKey, generateAuthKey } = await import("../lib/apikey.js");
const { hashPassword, verifyPassword } = await import("../lib/password.js");
const { extractApiKey, isFromNagora } = await import("../lib/auth.js");
const { signClientToken, verifyClientToken } = await import("../lib/handshake.js");

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
await ok("client token verifies only for the account it was signed for", () => {
  const account = { auth_key: generateAuthKey("ABCDEFGHIJ", generateApiKey()) };
  const other = { auth_key: generateAuthKey("ABCDEFGHIJ", generateApiKey()) };
  const token = signClientToken(account);
  assert.ok(verifyClientToken(token, account));
  assert.equal(verifyClientToken(token, other), null);
});
await ok("client token carries nothing derived from auth_key", () => {
  const account = { auth_key: generateAuthKey("ABCDEFGHIJ", generateApiKey()) };
  const [payloadPart] = signClientToken(account).split(".");
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat"]);
});
await ok("tampered client token is rejected", () => {
  const account = { auth_key: "ngr-ath-x" };
  const [, sig] = signClientToken(account).split(".");
  const forged = Buffer.from(JSON.stringify({ iat: 0, exp: 9e9 })).toString("base64url");
  assert.equal(verifyClientToken(`${forged}.${sig}`, account), null);
});

console.log(`\nAll ${passed} tests passed.`);
