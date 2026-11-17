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

// lib/ratelimit.js builds the Redis client on import; only its pure math is tested here.
process.env.KV_REST_API_URL ??= "https://redis.invalid";
process.env.KV_REST_API_TOKEN ??= "smoke-test-token";

const rooms = await import("../lib/rooms.js");
const rl = await import("../lib/ratelimit.js");

console.log("rooms:");
await ok("normalizeBans uppercases, dedupes, drops unknown names and sorts", () => {
  assert.deepEqual(rooms.normalizeBans(["politics", "GLOBAL", "global", "nope", "", null, 7]), ["GLOBAL", "POLITICS"]);
  assert.deepEqual(rooms.normalizeBans("akshually, all"), ["AKSHUALLY", "ALL"]);
  assert.deepEqual(rooms.normalizeBans(undefined), []);
  assert.deepEqual(rooms.normalizeBans({ GLOBAL: true }), []);
});
await ok("normalizeBans output only ever contains rooms or ALL", () => {
  for (const name of rooms.normalizeBans([...rooms.ROOMS, "ALL", "x", "ROOT"])) {
    assert.ok(name === "ALL" || rooms.ROOMS.includes(name));
  }
});
await ok("isBannedFrom: ALL covers every room, a partial ban only its rooms", () => {
  for (const room of rooms.ROOMS) assert.equal(rooms.isBannedFrom(["ALL"], room), true);
  assert.equal(rooms.isBannedFrom(["GLOBAL"], "GLOBAL"), true);
  assert.equal(rooms.isBannedFrom(["GLOBAL"], "POLITICS"), false);
  assert.equal(rooms.isBannedFrom(["global"], "GLOBAL"), true);
  assert.equal(rooms.isBannedFrom([], "GLOBAL"), false);
  assert.equal(rooms.isBannedFrom(null, "GLOBAL"), false);
});
await ok("bannedRooms expands ALL to every room", () => {
  assert.deepEqual(rooms.bannedRooms(["ALL"]), { all: true, rooms: rooms.ROOMS });
  assert.deepEqual(rooms.bannedRooms(["POLITICS", "GLOBAL"]), { all: false, rooms: ["GLOBAL", "POLITICS"] });
  assert.deepEqual(rooms.bannedRooms([]), { all: false, rooms: [] });
});
await ok("addBans / removeBans", () => {
  assert.deepEqual(rooms.addBans(["GLOBAL"], "politics"), ["GLOBAL", "POLITICS"]);
  assert.deepEqual(rooms.removeBans(["GLOBAL", "POLITICS"], ["GLOBAL"]), ["POLITICS"]);
  assert.deepEqual(rooms.removeBans(["GLOBAL", "POLITICS"], ["ALL"]), []);
  assert.deepEqual(rooms.removeBans(["ALL"], ["GLOBAL"]), ["AKSHUALLY", "POLITICS"]);
  assert.deepEqual(rooms.invalidRooms(["GLOBAL", "all", "LOBBY"]), ["LOBBY"]);
});
await ok("normalizeRoom accepts only known rooms", () => {
  assert.equal(rooms.normalizeRoom("global"), "GLOBAL");
  assert.equal(rooms.normalizeRoom("ALL"), null);
  assert.equal(rooms.normalizeRoom("lobby"), null);
  assert.equal(rooms.normalizeRoom(undefined), null);
});
await ok("isMod is true for mod and owner only", () => {
  assert.equal(rooms.isMod("mod"), true);
  assert.equal(rooms.isMod("owner"), true);
  assert.equal(rooms.isMod("user"), false);
  assert.equal(rooms.isMod(undefined), false);
});
await ok("canModerate: owner > mod > user, never an equal or higher role", () => {
  assert.equal(rooms.canModerate("owner", "user"), true);
  assert.equal(rooms.canModerate("owner", "mod"), true);
  assert.equal(rooms.canModerate("owner", "owner"), false);
  assert.equal(rooms.canModerate("mod", "user"), true);
  assert.equal(rooms.canModerate("mod", "mod"), false);
  assert.equal(rooms.canModerate("mod", "owner"), false);
  assert.equal(rooms.canModerate("user", "user"), false);
  assert.equal(rooms.canModerate("user", "mod"), false);
  assert.equal(rooms.canModerate(undefined, "user"), false);
});

console.log("ratelimit:");
await ok("windowStart / windowRemainingMs", () => {
  assert.equal(rl.windowStart(125000, 60000), 120000);
  assert.equal(rl.windowRemainingMs(125000, 60000), 55000);
  assert.equal(rl.windowRemainingMs(120000, 60000), 60000);
  assert.equal(rl.windowRemainingMs(179999, 60000), 1);
});
await ok("windowKey is namespaced and changes only when the window rolls over", () => {
  const a = rl.windowKey("room-post", "U1", 120000, 60000);
  assert.ok(a.startsWith("ngr:rl:room-post:U1:"), a);
  assert.equal(a, rl.windowKey("room-post", "U1", 179999, 60000));
  assert.notEqual(a, rl.windowKey("room-post", "U1", 180000, 60000));
  assert.notEqual(a, rl.windowKey("room-post", "U2", 120000, 60000));
});
await ok("slidingCount weighs the previous window by its remaining overlap", () => {
  assert.equal(rl.slidingCount(0, 5, 125000, 60000), 5);
  assert.equal(rl.slidingCount(20, 1, 120000, 60000), 21);  // window just rolled over: all 20 still count
  assert.equal(rl.slidingCount(20, 1, 150000, 60000), 11);  // halfway: half of them count
  assert.ok(rl.slidingCount(20, 1, 179999, 60000) < 1.01);  // end of the window: almost none
  // 20 posts late in one minute do not buy 20 more right after the boundary.
  assert.equal(rl.decide(rl.slidingCount(20, 1, 121000, 60000), 20, 121000, 60000).allowed, false);
});
await ok("decide allows up to the limit, then reports when to retry", () => {
  assert.deepEqual(rl.decide(1, 20, 125000, 60000), { allowed: true, remaining: 19, retryAfterSec: 0 });
  assert.deepEqual(rl.decide(20, 20, 125000, 60000), { allowed: true, remaining: 0, retryAfterSec: 0 });
  assert.deepEqual(rl.decide(21, 20, 125000, 60000), { allowed: false, remaining: 0, retryAfterSec: 55 });
  assert.equal(rl.decide(21, 20, 179999, 60000).retryAfterSec, 1);
});
await ok("limits match the spec", () => {
  assert.equal(rl.LIMITS.roomPostCooldown.ms, 1500);
  assert.deepEqual([rl.LIMITS.roomPostMinute.limit, rl.LIMITS.roomPostMinute.windowMs], [20, 60000]);
  assert.deepEqual([rl.LIMITS.roomReact.limit, rl.LIMITS.roomReact.windowMs], [30, 60000]);
  assert.deepEqual([rl.LIMITS.signup.limit, rl.LIMITS.signup.windowMs], [5, 3600000]);
  assert.deepEqual([rl.LIMITS.loginFail.limit, rl.LIMITS.loginFail.windowMs], [10, 900000]);
});
await ok("clientIp takes the first x-forwarded-for hop", () => {
  assert.equal(rl.clientIp({ headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), "203.0.113.7");
  assert.equal(rl.clientIp({ headers: {} }), "unknown");
});

console.log(`\nAll ${passed} tests passed.`);
