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

await ok("email and recovery limits match the spec", () => {
  assert.equal(rl.LIMITS.emailSendCooldown.ms, 60000);
  assert.deepEqual([rl.LIMITS.emailSendHour.limit, rl.LIMITS.emailSendHour.windowMs], [5, 3600000]);
  assert.deepEqual([rl.LIMITS.recoverAccount.limit, rl.LIMITS.recoverAccount.windowMs], [3, 3600000]);
  assert.deepEqual([rl.LIMITS.recoverIp.limit, rl.LIMITS.recoverIp.windowMs], [10, 3600000]);
  assert.ok(rl.cooldownKey(rl.LIMITS.emailSendCooldown.name, "U1:recover").startsWith("ngr:rl:"));
});

// lib/codes.js also imports the Redis client; only its pure parts run here.
process.env.EMAIL_CODE_SECRET ??= "smoke-test-code-secret";

const validate = await import("../lib/validate.js");
const codes = await import("../lib/codes.js");
const mail = await import("../lib/email.js");

console.log("validate:");
await ok("normalizeEmail trims and lowercases, non-strings become empty", () => {
  assert.equal(validate.normalizeEmail("  Ana.Silva@Example.COM \n"), "ana.silva@example.com");
  assert.equal(validate.normalizeEmail(""), "");
  for (const bad of [null, undefined, 5, {}, ["a@b.co"]]) assert.equal(validate.normalizeEmail(bad), "");
});
await ok("isValidEmail accepts ordinary addresses", () => {
  for (const good of ["a@b.co", "ana.silva+tag@mail.example.com", "x_y-z@sub.dominio.com.br", "1@2.io"]) {
    assert.equal(validate.isValidEmail(good), true, good);
  }
});
await ok("isValidEmail rejects malformed addresses", () => {
  const bad = ["", "nope", "a@b", "@b.co", "a@", "a b@c.com", "a@b..com", "a@-b.com", "a@b.com.", "a@@b.com",
    "a@b.com\nBcc: x@y.com", "a@b.com\r\n", "<a@b.com>", "Ana@Example.com", "josé@example.com", null, undefined, 5];
  for (const value of bad) assert.equal(validate.isValidEmail(value), false, String(value));
});
await ok("isValidEmail enforces 254 characters and a 64-character local part", () => {
  const domain = "@" + "d".repeat(60) + ".com";
  assert.equal(validate.isValidEmail("a".repeat(64) + domain), true);
  assert.equal(validate.isValidEmail("a".repeat(65) + domain), false);
  const long = "a".repeat(60) + "@" + ("b".repeat(60) + ".").repeat(3) + "com";
  assert.equal(long.length <= 254 && validate.isValidEmail(long), true);
  const tooLong = "a".repeat(60) + "@" + ("b".repeat(63) + ".").repeat(3) + "com";
  assert.ok(tooLong.length > 254);
  assert.equal(validate.isValidEmail(tooLong), false);
});
await ok("passwordProblem applies the signup rules", () => {
  assert.equal(validate.passwordProblem("pass1234"), null);
  assert.match(validate.passwordProblem("pass123"), /at least 8/);
  assert.match(validate.passwordProblem("onlyletters"), /letters and numbers/);
  assert.match(validate.passwordProblem("12345678"), /letters and numbers/);
  assert.match(validate.passwordProblem(undefined), /at least 8/);
});

console.log("codes:");
await ok("generateCode is always six digits", () => {
  for (let i = 0; i < 500; i++) assert.match(codes.generateCode(), /^[0-9]{6}$/);
  assert.equal(codes.isCodeFormat("012345"), true);
  for (const bad of ["12345", "1234567", "12345a", " 123456", 123456, null]) assert.equal(codes.isCodeFormat(bad), false);
});
await ok("hashCode: same input same hash", () => {
  const a = codes.hashCode("verify_email", "U1", "123456", "secret");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, codes.hashCode("verify_email", "U1", "123456", "secret"));
});
await ok("hashCode: different purpose, subject, code or secret gives a different hash", () => {
  const base = codes.hashCode("verify_email", "U1", "123456", "secret");
  assert.notEqual(base, codes.hashCode("recover", "U1", "123456", "secret"));
  assert.notEqual(base, codes.hashCode("verify_email", "U2", "123456", "secret"));
  assert.notEqual(base, codes.hashCode("verify_email", "U1", "123457", "secret"));
  assert.notEqual(base, codes.hashCode("verify_email", "U1", "123456", "other-secret"));
});
await ok("hashCode never contains the code and needs a secret", () => {
  assert.ok(!codes.hashCode("recover", "U1", "123456", "secret").includes("123456"));
  assert.throws(() => codes.hashCode("recover", "U1", "123456", ""));
});
await ok("codeKey is namespaced per purpose and subject", () => {
  assert.equal(codes.codeKey("recover", "U1"), "ngr:code:recover:U1");
  assert.notEqual(codes.codeKey("recover", "U1"), codes.codeKey("verify_email", "U1"));
  assert.equal(codes.CODE_TTL_SEC, 600);
});
await ok("judgeAttempt: the right code works on attempts 1 to 5 and is burned", () => {
  const stored = codes.hashCode("recover", "U1", "123456", "secret");
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.deepEqual(codes.judgeAttempt(stored, stored, attempt), { ok: true, burn: true });
  }
});
await ok("judgeAttempt: wrong codes are kept until the 5th, which burns the code", () => {
  const stored = codes.hashCode("recover", "U1", "123456", "secret");
  const wrong = codes.hashCode("recover", "U1", "654321", "secret");
  for (let attempt = 1; attempt <= 4; attempt++) {
    assert.deepEqual(codes.judgeAttempt(stored, wrong, attempt), { ok: false, burn: false });
  }
  assert.deepEqual(codes.judgeAttempt(stored, wrong, 5), { ok: false, burn: true });
  assert.equal(codes.MAX_ATTEMPTS, 5);
});
await ok("judgeAttempt: nothing succeeds past the 5th attempt or with a bad counter", () => {
  const stored = codes.hashCode("recover", "U1", "123456", "secret");
  assert.deepEqual(codes.judgeAttempt(stored, stored, 6), { ok: false, burn: true });
  assert.deepEqual(codes.judgeAttempt(stored, stored, 0), { ok: false, burn: true });
  assert.deepEqual(codes.judgeAttempt(stored, stored, NaN), { ok: false, burn: true });
  assert.equal(codes.judgeAttempt("", "", 1).ok, false);
  assert.equal(codes.judgeAttempt(stored, "zz", 1).ok, false);
});

console.log("email:");
await ok("emailConfigured needs all three in production", () => {
  const full = { VERCEL: "1", RESEND_API_KEY: "k", EMAIL_FROM: "f", EMAIL_CODE_SECRET: "s" };
  assert.equal(mail.emailConfigured(full), true);
  for (const missing of ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_CODE_SECRET"]) {
    assert.equal(mail.emailConfigured({ ...full, [missing]: "" }), false, missing);
  }
  assert.equal(mail.emailConfigured({ NODE_ENV: "production", EMAIL_CODE_SECRET: "s" }), false);
});
await ok("outside production only RESEND_API_KEY may be missing (console fallback)", () => {
  assert.equal(mail.emailConfigured({ EMAIL_CODE_SECRET: "s" }), true);
  assert.equal(mail.emailConfigured({}), false);
  assert.equal(mail.emailConfigured({ EMAIL_CODE_SECRET: "s", RESEND_API_KEY: "k" }), false);
  assert.equal(mail.isProduction({ VERCEL: "1" }), true);
  assert.equal(mail.isProduction({}), false);
});
await ok("templates: pt-BR text + html, code only where expected, no images or links", () => {
  const verify = mail.verifyEmailMessage({ username: "ana<b>", code: "012345" });
  const recover = mail.recoverMessage({ username: "ana", code: "543210" });
  const taken = mail.emailTakenMessage();
  const changed = mail.passwordChangedMessage({ username: "ana" });
  assert.ok(verify.text.includes("012345") && verify.html.includes("012345"));
  assert.ok(recover.text.includes("543210") && recover.html.includes("543210"));
  assert.ok(!verify.html.includes("ana<b>") && verify.html.includes("ana&lt;b&gt;"));
  assert.equal(changed.subject.startsWith("Sua senha foi alterada"), true);
  for (const m of [verify, recover, taken, changed]) {
    assert.ok(m.subject && m.text && m.html);
    assert.ok(!/<img|<a |https?:/i.test(m.html), m.subject);
  }
  for (const m of [taken, changed]) assert.ok(!/\b[0-9]{6}\b/.test(m.text), m.subject);
});
await ok("email-changed notice: date and time in Brasília time, no link, no code", () => {
  const when = new Date("2026-11-17T02:05:00Z"); // 16 November, 23:05 in Brasília
  assert.equal(mail.formatWhen(when), "16 de novembro de 2026 às 23:05 (horário de Brasília)");
  const m = mail.emailChangedMessage({ username: "ana", changedAt: when });
  assert.match(m.subject, /foi alterado/);
  for (const body of [m.text, m.html]) {
    assert.ok(body.includes("@ana") && body.includes("16 de novembro de 2026 às 23:05"), body);
    assert.ok(!/<img|<a |https?:/i.test(body));
  }
  assert.ok(!/\b[0-9]{6}\b/.test(m.text));
});

console.log(`\nAll ${passed} tests passed.`);
