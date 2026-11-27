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
const FROM = "NAGORA <no-reply@nagora.dpdns.org>";
await ok("emailConfigured needs a provider key, a valid EMAIL_FROM and EMAIL_CODE_SECRET in production", () => {
  for (const keyName of ["BREVO_API_KEY", "RESEND_API_KEY"]) {
    const full = { VERCEL: "1", [keyName]: "k", EMAIL_FROM: FROM, EMAIL_CODE_SECRET: "s" };
    assert.equal(mail.emailConfigured(full), true, keyName);
    for (const missing of [keyName, "EMAIL_FROM", "EMAIL_CODE_SECRET"]) {
      assert.equal(mail.emailConfigured({ ...full, [missing]: "" }), false, `${keyName} without ${missing}`);
    }
    assert.equal(mail.emailConfigured({ ...full, EMAIL_FROM: "NAGORA" }), false, "unparseable EMAIL_FROM");
  }
  assert.equal(mail.emailConfigured({ NODE_ENV: "production", EMAIL_CODE_SECRET: "s" }), false);
});
await ok("outside production only the provider key may be missing (console fallback)", () => {
  assert.equal(mail.emailConfigured({ EMAIL_CODE_SECRET: "s" }), true);
  assert.equal(mail.emailConfigured({}), false);
  assert.equal(mail.emailConfigured({ EMAIL_CODE_SECRET: "s", RESEND_API_KEY: "k" }), false);
  assert.equal(mail.emailConfigured({ EMAIL_CODE_SECRET: "s", BREVO_API_KEY: "k" }), false);
  assert.equal(mail.isProduction({ VERCEL: "1" }), true);
  assert.equal(mail.isProduction({}), false);
});
await ok("provider: BREVO_API_KEY first, then RESEND_API_KEY, else none", () => {
  assert.equal(mail.emailProvider({ BREVO_API_KEY: "b" }), "brevo");
  assert.equal(mail.emailProvider({ BREVO_API_KEY: "b", RESEND_API_KEY: "r" }), "brevo");
  assert.equal(mail.emailProvider({ RESEND_API_KEY: "r" }), "resend");
  assert.equal(mail.emailProvider({ BREVO_API_KEY: "", RESEND_API_KEY: "r" }), "resend");
  assert.equal(mail.emailProvider({}), null);
});
await ok("EMAIL_FROM parses into sender name and email", () => {
  assert.deepEqual(mail.parseSender(FROM), { name: "NAGORA", email: "no-reply@nagora.dpdns.org" });
  assert.deepEqual(mail.parseSender('  "NAGORA App"  <No-Reply@Nagora.dpdns.org> '), { name: "NAGORA App", email: "no-reply@nagora.dpdns.org" });
  assert.deepEqual(mail.parseSender("no-reply@nagora.dpdns.org"), { name: "", email: "no-reply@nagora.dpdns.org" });
  assert.deepEqual(mail.parseSender("<no-reply@nagora.dpdns.org>"), { name: "", email: "no-reply@nagora.dpdns.org" });
  for (const bad of ["", "NAGORA", "NAGORA <>", "NAGORA <not an address>", "NAGORA <a@b>", null, undefined, 5]) {
    assert.equal(mail.parseSender(bad), null, String(bad));
  }
});
await ok("Brevo request body: sender, to, subject, htmlContent, textContent, no tracking pixel", () => {
  const message = mail.verifyEmailMessage({ username: "ana", code: "012345" });
  const body = mail.brevoRequestBody({ sender: mail.parseSender(FROM), to: "ana@example.com", ...message });
  assert.deepEqual(Object.keys(body).sort(), ["htmlContent", "sender", "subject", "textContent", "to"]);
  assert.deepEqual(body.sender, { name: "NAGORA", email: "no-reply@nagora.dpdns.org" });
  assert.deepEqual(body.to, [{ email: "ana@example.com", removeTrackingPixel: true, contactPixelTrackingConsent: false }]);
  assert.equal(body.subject, message.subject);
  assert.equal(body.htmlContent, message.html);
  assert.equal(body.textContent, message.text);
  const bare = mail.brevoRequestBody({ sender: mail.parseSender("no-reply@nagora.dpdns.org"), to: "a@b.co", ...message });
  assert.deepEqual(bare.sender, { email: "no-reply@nagora.dpdns.org" });
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

console.log("cosmetics:");
const cosmetics = await import("../lib/cosmetics.js");
await ok("name color: the first 20 existing accounts by signup order (SQL decides, gaps in ids skipped)", () => {
  assert.equal(cosmetics.NAME_COLOR_FREE_ACCOUNTS, 20);
  assert.equal(cosmetics.nameColorAllowed({ name_color_allowed: true }), true);
  for (const v of [false, null, undefined, "true", 1]) assert.equal(cosmetics.nameColorAllowed({ id: 1, name_color_allowed: v }), false, String(v));
  assert.equal(cosmetics.nameColorAllowed({ id: 1 }), false, "the raw id alone never allows it");
  assert.equal(cosmetics.nameColorAllowed(null), false);
  const cutoff = "COALESCE((SELECT nc.id FROM accounts nc ORDER BY nc.id OFFSET 19 LIMIT 1), 2147483647)";
  assert.equal(cosmetics.nameColorCutoffSql(), cutoff);
  assert.equal(cosmetics.nameColorSql("a"), `CASE WHEN a.id <= ${cutoff} THEN a.name_color END`);
  assert.equal(cosmetics.nameColorAllowedSql("accounts"), `(accounts.id <= ${cutoff}) AS name_color_allowed`);
});
await ok("name color: normalized to lowercase #rrggbb", () => {
  assert.equal(cosmetics.normalizeNameColor("#FF8800"), "#ff8800");
  assert.equal(cosmetics.normalizeNameColor(" #f80 "), "#ff8800");
  for (const bad of ["ff8800", "#ff880", "#ff88001", "#gg0000", "red", "", null, 123, "#ff8800;background:red", "url(x)"]) {
    assert.equal(cosmetics.normalizeNameColor(bad), null, String(bad));
  }
});
await ok("name color: only practically invisible colors are refused (1.5:1, server and client agree)", async () => {
  assert.equal(cosmetics.NAME_COLOR_MIN_CONTRAST, 1.5);
  const fs = await import("node:fs");
  const bundle = fs.readFileSync(new URL("../js/UGqaIF1Z55PgcI4.js", import.meta.url), "utf8");
  assert.equal(Number(bundle.match(/const NAME_COLOR_MIN_CONTRAST = ([\d.]+);/)[1]), cosmetics.NAME_COLOR_MIN_CONTRAST);
  for (const ok of ["#ffffff", "#ff4444", "#4fc3f7", "#c11c84", "#C11C84", "#0000ff", "#800080", "#006400", "#555555"]) {
    assert.equal(cosmetics.nameColorProblem(ok), null, ok);
  }
  for (const dark of ["#000000", "#2a2a2a", "#3a3a3a", "#444444", "#000080", "#4b0082", "#600000", "#8b0000"]) {
    assert.equal(cosmetics.nameColorProblem(dark), "contrast", dark);
  }
  assert.equal(cosmetics.nameColorProblem("blue"), "format");
  assert.ok(Math.abs(cosmetics.contrastRatio("#ffffff", "#000000") - 21) < 1e-9);
  assert.equal(cosmetics.contrastRatio("#123456", "#123456"), 1);
});

console.log("image pipeline (client, js/b2WrIeyFDyJ13PU.js):");
await import("../js/b2WrIeyFDyJ13PU.js");
const NI = globalThis.NagoraImage;
const images = await import("../lib/images.js");

/** Minimal GIF89a with `frames` 1x1 frames. */
function makeGif(frames) {
  const bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00); // loop extension
  for (let i = 0; i < frames; i++) {
    bytes.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);            // graphic control
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00);                         // image descriptor
    bytes.push(0x02, 0x02, 0x4c, 0x01, 0x00);                               // LZW data
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

const near = (a, b) => Math.abs(a - b) < 1e-6;

await ok("scaling: longest side at most 1600, ratio kept, never enlarged", () => {
  assert.deepEqual(NI.fitWithin(3200, 2400, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(NI.fitWithin(1200, 4000, 1600), { width: 480, height: 1600 });
  assert.deepEqual(NI.fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(NI.fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(NI.fitWithin(1, 10000, 1600), { width: 1, height: 1600 });
  assert.equal(NI.MAX_SIDE, 1600);
});
await ok("crop presets: largest centered rectangle with the preset ratio", () => {
  const ids = NI.CROP_PRESETS.map(p => p.id);
  assert.deepEqual(ids, ["free", "1:1", "4:3", "16:9"]);
  for (const [W, H] of [[4000, 3000], [1000, 2000], [1920, 1080], [500, 500]]) {
    for (const { id, aspect } of NI.CROP_PRESETS) {
      const r = NI.initialCrop(aspect, W, H);
      if (!aspect) {
        assert.deepEqual(r, { x: 0, y: 0, w: W, h: H }, `${id} ${W}x${H}`);
        continue;
      }
      assert.ok(near(r.w / r.h, aspect), `${id} ${W}x${H} ratio`);
      assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9, `${id} ${W}x${H} inside`);
      assert.ok(near(r.w, W) || near(r.h, H), `${id} ${W}x${H} largest`);
      assert.ok(near(r.x, (W - r.w) / 2) && near(r.y, (H - r.h) / 2), `${id} ${W}x${H} centered`);
    }
  }
  assert.deepEqual(NI.initialCrop(1, 4000, 3000), { x: 500, y: 0, w: 3000, h: 3000 });
  assert.deepEqual(NI.initialCrop(16 / 9, 4000, 3000), { x: 0, y: 375, w: 4000, h: 2250 });
});
await ok("crop drag: corners resize from the opposite corner, keep the ratio, stay inside", () => {
  const W = 1000, H = 800;
  const start = { x: 100, y: 100, w: 400, h: 400 };
  // free: se corner grows by (50, 20)
  assert.deepEqual(NI.resizeCrop(start, "se", 50, 20, null, W, H, 32), { x: 100, y: 100, w: 450, h: 420 });
  // free: nw corner dragged past the image edge is clamped at 0
  assert.deepEqual(NI.resizeCrop(start, "nw", -500, -500, null, W, H, 32), { x: 0, y: 0, w: 500, h: 500 });
  // locked aspect, for every preset and corner, huge and tiny drags
  for (const { aspect } of NI.CROP_PRESETS.filter(p => p.aspect)) {
    for (const corner of ["nw", "ne", "sw", "se"]) {
      for (const [dx, dy] of [[5000, 5000], [-5000, -5000], [37, -12], [-390, -390], [390, 390]]) {
        const r = NI.resizeCrop(start, corner, dx, dy, aspect, W, H, 32);
        assert.ok(near(r.w / r.h, aspect), `${aspect} ${corner} ${dx},${dy} ratio`);
        assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9, `${aspect} ${corner} ${dx},${dy} inside`);
        assert.ok(r.w >= 32 - 1e-9 && r.h >= 32 - 1e-9, `${aspect} ${corner} ${dx},${dy} min`);
      }
    }
  }
  // the anchor (opposite corner) does not move
  const r = NI.resizeCrop(start, "nw", 30, 30, 1, W, H, 32);
  assert.ok(near(r.x + r.w, 500) && near(r.y + r.h, 500));
  // minimum size when dragged through the anchor
  assert.deepEqual(NI.resizeCrop(start, "se", -1000, -1000, null, W, H, 32), { x: 100, y: 100, w: 32, h: 32 });
});
await ok("crop move and rounding stay inside the image", () => {
  const W = 1000, H = 800;
  assert.deepEqual(NI.moveCrop({ x: 100, y: 100, w: 400, h: 300 }, 9999, -9999, W, H), { x: 600, y: 0, w: 400, h: 300 });
  assert.deepEqual(NI.moveCrop({ x: 100, y: 100, w: 400, h: 300 }, 10, 20, W, H), { x: 110, y: 120, w: 400, h: 300 });
  const r = NI.roundCrop({ x: 999.6, y: -0.4, w: 10.7, h: 900 }, W, H);
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && r.w >= 1 && r.h >= 1, JSON.stringify(r));
  assert.deepEqual(NI.roundCrop({ x: 10.4, y: 20.6, w: 100.5, h: 50.2 }, W, H), { x: 10, y: 21, w: 101, h: 50 });
});
await ok("size caps: 15 MB input, 1 MB output, same 1 MB cap on the server", () => {
  const MB = 1024 * 1024;
  assert.equal(NI.inputProblem({ type: "image/png", size: 15 * MB }), null);
  assert.equal(NI.inputProblem({ type: "image/jpeg", size: 15 * MB + 1 }), "size");
  assert.equal(NI.inputProblem({ type: "image/jpeg", size: 20 * MB }), "size");
  assert.equal(NI.inputProblem({ type: "image/png", size: 0 }), "size");
  assert.equal(NI.inputProblem({ type: "application/pdf", size: 1000 }), "type");
  assert.equal(NI.inputProblem({ type: "", size: 1000 }), "type");
  assert.equal(NI.inputProblem(null), "type");
  assert.equal(NI.outputProblem(MB), null);
  assert.equal(NI.outputProblem(MB + 1), "size");
  assert.equal(NI.outputProblem(0), "size");
  assert.equal(NI.MAX_OUTPUT_BYTES, images.MAX_IMAGE_BYTES);
  assert.equal(images.imageSizeProblem(MB), null);
  assert.equal(images.imageSizeProblem(MB + 1), "Image file is too large");
  assert.equal(images.imageSizeProblem(0), "Invalid image file");
  assert.throws(() => images.decodeImageBase64(Buffer.alloc(MB + 1).toString("base64")), /too large/);
  assert.equal(images.decodeImageBase64(Buffer.alloc(MB, 1).toString("base64")).length, MB);
  assert.throws(() => images.decodeImageBase64(""), /required/);
  assert.deepEqual(NI.QUALITY_STEPS, [0.82, 0.72, 0.6]);
  assert.equal(NI.kilobytes(1), 1);
  assert.equal(NI.kilobytes(250 * 1024), 250);
});
await ok("GIF bypass: only animated GIFs skip scaling and cropping", async () => {
  const still = makeGif(1);
  const animated = makeGif(3);
  assert.equal(NI.gifFrameCount(still), 1);
  assert.equal(NI.gifFrameCount(animated), 2); // stops counting at 2
  assert.equal(NI.gifFrameCount(animated, 10), 3);
  assert.equal(NI.gifFrameCount(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), 0);
  assert.equal(NI.gifFrameCount(still.slice(0, 20)), 0); // truncated
  assert.equal(NI.bypassesProcessing("image/gif", 2), true);
  assert.equal(NI.bypassesProcessing("image/gif", 1), false);
  assert.equal(NI.bypassesProcessing("image/png", 5), false);
  // sharp reads the same frame counts from the same bytes
  const sharp = (await import("sharp")).default;
  assert.equal((await sharp(Buffer.from(still)).metadata()).pages || 1, 1);
  assert.equal((await sharp(Buffer.from(animated)).metadata()).pages, 3);
});

console.log("image re-encode (server, lib/images.js):");
await ok("re-encode: WebP, metadata stripped, client MIME ignored, SVG refused", async () => {
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#c33" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const out = await images.processMessageImage(jpeg);
  assert.equal(out.mediaType, "image/webp");
  assert.deepEqual([out.width, out.height], [800, 1600]); // EXIF rotation applied, then fit to 1600
  const meta = await sharp(out.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(!meta.exif && !meta.orientation && !meta.xmp && !meta.icc, "no metadata left");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  await assert.rejects(images.processMessageImage(svg), /Unsupported image format/);
  await assert.rejects(images.processMessageImage(Buffer.from("not an image")), /Invalid image file/);
  // Three different frames (identical ones would be merged by the WebP encoder).
  const raw = Buffer.concat(await Promise.all(["#f00", "#0f0", "#00f"].map(c =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: c } }).raw().toBuffer())));
  const gif = await sharp(raw, { raw: { width: 8, height: 24, channels: 3, pageHeight: 8 } }).gif({ delay: [100, 100, 100] }).toBuffer();
  assert.equal(NI.gifFrameCount(new Uint8Array(gif), 10), 3, "client parser agrees with an encoder-made GIF");
  const anim = await images.processMessageImage(gif);
  assert.equal((await sharp(anim.bytes, { animated: true }).metadata()).pages, 3, "animation kept");
  assert.deepEqual([anim.width, anim.height], [8, 8], "frame size, not the frame strip");
  const avatar = await sharp(await images.processAvatarImage(jpeg)).metadata();
  assert.deepEqual([avatar.format, avatar.width, avatar.height], ["webp", 128, 128]);
});

// ── Integrations (Last.fm, Steam, X), owner dashboard ────────────────────
const integ = await import("../lib/integrations.js");
const roomsLib = await import("../lib/rooms.js");
const { createHash } = await import("node:crypto");

console.log("integrations: public activity, cache, schedule:");
await ok("no privacy setting: no visibility rules are exported", () => {
  assert.equal(integ.canViewIntegration, undefined);
  assert.equal(integ.normalizeVisibility, undefined);
  assert.equal(integ.VISIBILITIES, undefined);
});
await ok("room feed order: live first, then the newest activity, then username", () => {
  const at = (iso) => ({ x: { post: { createdAt: iso } } });
  const members = [
    { username: "b", activity: at("2026-01-01T00:00:00Z") },
    { username: "a", activity: at("2026-01-01T00:00:00Z") },
    { username: "new", activity: { lastfm: { track: { nowPlaying: false, playedAt: "2026-05-01T00:00:00Z" } } } },
    { username: "gaming", activity: { steam: { player: { game: { name: "G" } } } } },
    { username: "listening", activity: { lastfm: { track: { nowPlaying: true, playedAt: null } } } },
    { username: "undated", activity: { steam: { player: { game: null } } } },
  ];
  const order = integ.sortFeed(members).map(m => m.username);
  assert.deepEqual(order, ["gaming", "listening", "new", "a", "b", "undated"]);
  assert.equal(members[0].username, "b"); // input untouched
  assert.deepEqual(integ.feedSortKey(null), { live: false, at: 0 });
  assert.deepEqual(integ.feedSortKey({ x: { post: { createdAt: "garbage" } } }), { live: false, at: 0 });
});
await ok("room feed: only accounts with something to show", () => {
  assert.equal(integ.hasActivity({}), false);
  assert.equal(integ.hasActivity({ x: { handle: "a", post: null } }), false);
  assert.equal(integ.hasActivity({ x: { post: { id: "1" } } }), true);
  assert.equal(integ.hasActivity({ lastfm: { unavailable: true } }), true);
  assert.equal(integ.hasActivity({ steam: { player: {} } }), true);
  assert.equal(integ.ROOM_FEED_LIMIT, 50);
});
await ok("steam last played: newest rtime_last_played, never-played and private libraries skipped", () => {
  const p = integ.parseSteamLastPlayed;
  const json = { response: { game_count: 4, games: [
    { appid: 10, name: "Old", rtime_last_played: 1600000000 },
    { appid: 730, name: "Counter-Strike 2", rtime_last_played: 1700000000 },
    { appid: 20, name: "Never", rtime_last_played: 0 },
    { appid: "x", name: "Bad id", rtime_last_played: 1800000000 },
  ] } };
  assert.deepEqual(p(json), {
    id: "730", name: "Counter-Strike 2", playedAt: new Date(1700000000 * 1000).toISOString(),
    capsuleUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_184x69.jpg",
  });
  assert.equal(p({ response: {} }), null);              // game details private
  assert.equal(p({ response: { games: [{ appid: 20, name: "Never", rtime_last_played: 0 }] } }), null);
  assert.equal(p(null), null);
  assert.equal(integ.cacheTtlMs("steam-last"), 600000);
  // The room feed dates a member by it too.
  assert.equal(integ.feedSortKey({ steam: { player: { game: null }, lastPlayed: { playedAt: "2026-01-02T00:00:00.000Z" } } }).at, Date.parse("2026-01-02T00:00:00.000Z"));
});
await ok("cache TTL: Last.fm 30 s, Steam 60 s, freshness by age", () => {
  assert.equal(integ.cacheTtlMs("lastfm"), 30000);
  assert.equal(integ.cacheTtlMs("steam"), 60000);
  assert.equal(integ.cacheTtlMs("x"), 0);
  const now = 1_000_000;
  assert.equal(integ.isCacheFresh({ at: now - 29_999 }, "lastfm", now), true);
  assert.equal(integ.isCacheFresh({ at: now - 30_000 }, "lastfm", now), false);
  assert.equal(integ.isCacheFresh({ at: now - 59_000 }, "steam", now), true);
  assert.equal(integ.isCacheFresh(null, "steam", now), false);
});
await ok("next_check_at: +1 h on success, +10 min on failure", () => {
  const now = Date.UTC(2026, 10, 17, 12, 0, 0);
  assert.equal(integ.nextCheckAt(true, now).toISOString(), "2026-11-17T13:00:00.000Z");
  assert.equal(integ.nextCheckAt(false, now).toISOString(), "2026-11-17T12:10:00.000Z");
});
await ok("provider availability follows the env vars (X needs none)", () => {
  assert.equal(integ.providerAvailable("x", {}), true);
  const S = { INTEGRATION_STATE_SECRET: "s" };
  assert.equal(integ.providerAvailable("lastfm", { LASTFM_API_KEY: "k", ...S }), false);
  assert.equal(integ.providerAvailable("lastfm", { LASTFM_API_KEY: "k", LASTFM_SHARED_SECRET: "x", ...S }), true);
  assert.equal(integ.providerAvailable("steam", S), false);
  assert.equal(integ.providerAvailable("steam", { STEAM_API_KEY: "k", ...S }), true);
  assert.equal(integ.providerAvailable("spotify", { STEAM_API_KEY: "k" }), false);
});

await ok("link flows unavailable without INTEGRATION_STATE_SECRET (X unaffected, API_KEY_SEED not used)", () => {
  const keys = { LASTFM_API_KEY: "k", LASTFM_SHARED_SECRET: "x", STEAM_API_KEY: "k", API_KEY_SEED: "seed" };
  for (const secret of [undefined, "", "   "]) {
    const env = { ...keys, INTEGRATION_STATE_SECRET: secret };
    assert.equal(integ.providerAvailable("lastfm", env), false);
    assert.equal(integ.providerAvailable("steam", env), false);
    assert.equal(integ.providerAvailable("x", env), true);
  }
  assert.throws(() => integ.stateKey(undefined), /INTEGRATION_STATE_SECRET/);
  assert.throws(() => integ.stateKey(""), /INTEGRATION_STATE_SECRET/);
});

console.log("integrations: signed link state:");
await ok("state: valid, expired, tampered, other user / provider", () => {
  const key = integ.stateKey("smoke-state-secret");
  const now = 1_700_000_000_000;
  const token = integ.signState(key, { userId: "U1", provider: "lastfm", nonce: "n1", now });
  assert.deepEqual(integ.verifyState(key, token, { userId: "U1", provider: "lastfm", now: now + 1000 }), { ok: true, nonce: "n1" });
  assert.equal(integ.verifyState(key, token, { userId: "U1", provider: "lastfm", now: now + integ.STATE_TTL_MS }).reason, "expired");
  assert.equal(integ.verifyState(key, token, { userId: "U2", provider: "lastfm", now }).reason, "mismatch");
  assert.equal(integ.verifyState(key, token, { userId: "U1", provider: "steam", now }).reason, "mismatch");
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "U2", p: "lastfm", n: "n1", exp: now + 60000 })).toString("base64url");
  assert.equal(integ.verifyState(key, `${forged}.${sig}`, { userId: "U2", provider: "lastfm", now }).reason, "signature");
  assert.equal(integ.verifyState(key, `${payload}.${sig.slice(0, -2)}AA`, { userId: "U1", provider: "lastfm", now }).reason, "signature");
  assert.equal(integ.verifyState(integ.stateKey("other-state-secret"), token, { userId: "U1", provider: "lastfm", now }).reason, "signature");
  assert.equal(integ.verifyState(key, "garbage", { userId: "U1", provider: "lastfm", now }).reason, "malformed");
});

console.log("integrations: X:");
await ok("X handle normalization and bio code", () => {
  assert.equal(integ.normalizeXHandle("@Nasa_JPL"), "Nasa_JPL");
  assert.equal(integ.normalizeXHandle("https://x.com/NASA?s=20"), "NASA");
  assert.equal(integ.normalizeXHandle("twitter.com/jack/"), "jack");
  assert.equal(integ.normalizeXHandle("bad handle"), null);
  assert.equal(integ.normalizeXHandle("waytoolonghandle1"), null);
  const code = integ.makeXCode((n) => n - 1);
  assert.match(code, /^nagora-[a-z0-9]{5}$/);
  assert.equal(integ.bioHasCode(`Photographer. ${code.toUpperCase()} 🌙`, code), true);
  assert.equal(integ.bioHasCode("Photographer. nagora-zzzzz", code), false);
  assert.equal(integ.bioHasCode(undefined, code), false);
});
await ok("X: last original post skips retweet, reply and pinned; quote counts", () => {
  const me = { screen_name: "Someone" };
  const s = (id, ts, extra = {}) => ({ type: "status", id, created_timestamp: ts, text: `post ${id}`, url: `https://x.com/Someone/status/${id}`, author: me, replying_to: null, reposted_by: null, ...extra });
  const pinned = s("1", 100);
  const original = s("2", 500);
  const retweet = s("3", 900, { author: { screen_name: "Other" }, reposted_by: me });
  const reply = s("4", 800, { replying_to: { screen_name: "Other", status: "77" } });
  const quote = s("5", 700, { quote: { text: "quoted text", url: "https://x.com/Other/status/66", author: { screen_name: "Other" } } });
  const pick = (list) => integ.pickLastOriginalPost(list, "someone")?.id ?? null;
  assert.equal(pick([pinned, retweet, reply, original]), "2", "retweet and reply skipped, old pinned skipped");
  assert.equal(pick([pinned, retweet, reply, quote, original]), "5", "a quote post counts");
  assert.equal(pick([retweet, reply]), null, "no original post: nothing");
  assert.equal(pick([original]), "2", "a single post is not treated as pinned");
  assert.equal(pick([s("9", 1000), original]), "9", "a newest first post is not pinned");
  const stored = integ.summarizePost(quote);
  assert.deepEqual(stored.quote, { author: "Other", text: "quoted text", url: "https://x.com/Other/status/66" });
  assert.equal(stored.createdAt, new Date(700_000).toISOString());
});
await ok("X: stored post keeps only https x.com / pbs.twimg.com URLs", () => {
  const post = integ.summarizePost({
    id: 1, text: "hi", created_timestamp: 1, url: "javascript:alert(1)",
    media: {
      photos: [{ url: "https://pbs.twimg.com/media/A.jpg?name=orig" }, { url: "https://evil.example/x.jpg" }],
      videos: [{ thumbnail_url: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/B.jpg" }, { thumbnail_url: "http://pbs.twimg.com/C.jpg" }],
    },
  });
  assert.equal(post.url, null);
  assert.deepEqual(post.media, ["https://pbs.twimg.com/media/A.jpg?name=small", "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/B.jpg"]);
});
await ok("X: FxTwitter profile shape", () => {
  const p = integ.parseFxProfile({ code: 200, message: "OK", user: { screen_name: "NASA", name: "NASA", description: "Bio nagora-abcde" } });
  assert.deepEqual(p, { screenName: "NASA", name: "NASA", description: "Bio nagora-abcde" });
  assert.equal(integ.parseFxProfile({ code: 404, message: "User not found" }), null);
});

console.log("integrations: Last.fm and Steam shapes:");
await ok("Last.fm: api_sig is MD5 of sorted name+value pairs + secret (format excluded)", () => {
  const sig = integ.lastfmSignature({ token: "TOK", method: "auth.getSession", api_key: "KEY", format: "json" }, "SECRET");
  assert.equal(sig, createHash("md5").update("api_keyKEYmethodauth.getSessiontokenTOKSECRET").digest("hex"));
  assert.equal(integ.lastfmAuthUrl("K y"), "https://www.last.fm/api/auth/?api_key=K%20y");
  assert.deepEqual(integ.parseLastfmSession({ session: { name: "rj", key: "SESSIONKEY", subscriber: 0 } }), { name: "rj" });
  assert.throws(() => integ.parseLastfmSession({ error: 4, message: "Invalid token" }));
});
await ok("Last.fm: now playing, last played, single object, placeholder art, private", () => {
  const img = (url) => [{ size: "small", "#text": "" }, { size: "extralarge", "#text": url }];
  const now = integ.parseLastfmRecent({ recenttracks: { track: [
    { artist: { "#text": "Daft Punk" }, name: "Veridis Quo", album: { "#text": "Discovery" }, image: img("https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg"), "@attr": { nowplaying: "true" }, url: "https://www.last.fm/music/Daft+Punk/_/Veridis+Quo" },
    { artist: { "#text": "Air" }, name: "La femme d'argent", album: { "#text": "" }, image: [], date: { uts: "1700000000" } },
  ], "@attr": { user: "rj" } } });
  assert.equal(now.nowPlaying, true);
  assert.equal(now.title, "Veridis Quo");
  assert.equal(now.artist, "Daft Punk");
  assert.equal(now.imageUrl, "https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg");
  assert.equal(now.playedAt, null);
  const last = integ.parseLastfmRecent({ recenttracks: { track: { artist: { "#text": "Air" }, name: "Talisman", album: { "#text": "" }, image: img("https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"), date: { uts: "1700000000" } } } });
  assert.equal(last.nowPlaying, false);
  assert.equal(last.imageUrl, null, "Last.fm's placeholder star is not album art");
  assert.equal(last.album, null);
  assert.equal(last.playedAt, new Date(1700000000 * 1000).toISOString());
  assert.equal(integ.parseLastfmRecent({ recenttracks: { track: [] } }), null);
  assert.throws(() => integ.parseLastfmRecent({ error: 17, message: "Login: User required to be logged in" }), (e) => e.code === 17);
});
await ok("Steam: player summary (public in game, private), OpenID assertion checks", () => {
  const pub = integ.parseSteamPlayer({ response: { players: [{ steamid: "76561197960435530", communityvisibilitystate: 3, personaname: "Robin", personastate: 1, gameextrainfo: "Counter-Strike 2", gameid: "730", avatarfull: "https://avatars.steamstatic.com/abc_full.jpg", profileurl: "https://steamcommunity.com/id/robinwalker/" }] } });
  assert.equal(pub.state, "online");
  assert.equal(pub.isPublic, true);
  assert.deepEqual(pub.game, { name: "Counter-Strike 2", id: "730", capsuleUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_184x69.jpg" });
  const priv = integ.parseSteamPlayer({ response: { players: [{ steamid: "1", communityvisibilitystate: 1, personaname: "Hidden", personastate: 0 }] } });
  assert.equal(priv.isPublic, false);
  assert.equal(priv.game, null);
  assert.equal(integ.parseSteamPlayer({ response: { players: [] } }), null);

  const origin = "https://etanagora.vercel.app";
  const claimed = "https://steamcommunity.com/openid/id/76561197960435530";
  const good = {
    "openid.mode": "id_res", "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.return_to": `${origin}/api/steam-callback`, "openid.claimed_id": claimed, "openid.identity": claimed,
    "openid.sig": "x", route: "steam-callback",
  };
  assert.deepEqual(integ.readSteamAssertion(good, origin), { steamId: "76561197960435530" });
  assert.equal(integ.readSteamAssertion({ ...good, "openid.return_to": "https://evil.example/api/steam-callback" }, origin).error, "failed");
  assert.equal(integ.readSteamAssertion({ ...good, "openid.claimed_id": "https://steamcommunity.com/openid/id/123" }, origin).error, "failed");
  assert.equal(integ.readSteamAssertion({ "openid.mode": "cancel" }, origin).error, "denied");
  const body = integ.steamCheckBody(good);
  assert.equal(body.get("openid.mode"), "check_authentication");
  assert.equal(body.get("route"), null, "only openid.* fields go back to Steam");
  assert.equal(integ.steamCheckValid("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"), true);
  assert.equal(integ.steamCheckValid("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n"), false);
  assert.match(integ.steamLoginUrl(origin), /^https:\/\/steamcommunity\.com\/openid\/login\?.*openid\.return_to=https%3A%2F%2Fetanagora\.vercel\.app%2Fapi%2Fsteam-callback/);
});

console.log("owner dashboard:");
await ok("owner-only permission: only role owner; owner acts on users and mods, never another owner", () => {
  assert.equal(roomsLib.isOwner("owner"), true);
  assert.equal(roomsLib.isOwner("mod"), false);
  assert.equal(roomsLib.isOwner("user"), false);
  assert.equal(roomsLib.isOwner(undefined), false);
  assert.equal(roomsLib.canModerate("owner", "user"), true);
  assert.equal(roomsLib.canModerate("owner", "mod"), true);
  assert.equal(roomsLib.canModerate("owner", "owner"), false);
});
await ok("reserved usernames: lowercase, '@' dropped, signup rule", () => {
  assert.deepEqual(validate.normalizeReservedUsername("  @Admin123 "), { name: "admin123" });
  assert.ok(validate.normalizeReservedUsername("abc").error, "too short");
  assert.ok(validate.normalizeReservedUsername("has space1").error, "whitespace");
  assert.ok(validate.normalizeReservedUsername("a".repeat(16)).error, "too long");
  assert.equal(validate.usernameProblem("ValidName1"), null);
});
await ok("signup username: 5-15 ASCII letters or digits only (server and auth page agree)", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync(new URL("../js/DoviawP1ZfaCZBN.js", import.meta.url), "utf8");
  const src = page.match(/const USERNAME_RE = (\/.+\/);/)[1];
  assert.equal(src, String(validate.USERNAME_RE));
  for (const good of ["lulu1", "Lulu2026", "abcde", "123456789012345"]) assert.equal(validate.usernameProblem(good), null, good);
  for (const bad of ["lulu", "a".repeat(16), "lu*lu", "lu-lu", "lu_lu", "lu.lu", "@lulu1", "lulu 1", "lúlu1", "lulu１", "ｌｕｌｕ1", "lulu​1", "", null]) {
    assert.ok(validate.usernameProblem(bad), String(bad));
  }
});
await ok("room registry: every room has a one-line description", () => {
  const d = roomsLib.roomDescriptions();
  assert.deepEqual(Object.keys(d), roomsLib.ROOMS);
  for (const room of roomsLib.ROOMS) assert.ok(d[room] && !d[room].includes("\n"));
  assert.equal(d.POLITICS, "Política e atualidades.");
  assert.equal(d.AKSHUALLY, "O mesmo que Global, só que sério.");
});
await ok("room nicknames: trimmed, spaces collapsed, invisible characters dropped, 20 max", () => {
  const n = roomsLib.normalizeNickname;
  assert.deepEqual(n("  o   sábio  "), { value: "o sábio" });
  assert.deepEqual(n("a\u200Bb\u202Ec\u0007"), { value: "abc" });
  assert.deepEqual(n(""), { value: null });
  assert.deepEqual(n("   "), { value: null });
  assert.deepEqual(n(null), { value: null });
  assert.deepEqual(n(undefined), { value: null });
  assert.deepEqual(n("\u200B"), { value: null });
  assert.ok(n(42).error);
  assert.deepEqual(n("x".repeat(20)), { value: "x".repeat(20) });
  assert.ok(n("x".repeat(21)).error);
  // Code points, like the table's char_length: 20 emoji fit.
  assert.deepEqual(n("😀".repeat(20)), { value: "😀".repeat(20) });
  assert.ok(n("😀".repeat(21)).error);
  assert.equal(roomsLib.NICKNAME_MAX, 20);
});

console.log("link previews:");
const lp = await import("../lib/linkpreview.js");
const lpf = await import("../lib/previewfetch.js");
const dnsMod = (await import("node:dns")).default;
const { readFileSync } = await import("node:fs");

// The client repeats the URL rule between two markers; run the same cases through both.
const clientRule = (() => {
  const src = readFileSync(new URL("../js/UGqaIF1Z55PgcI4.js", import.meta.url), "utf8");
  const m = src.match(/\/\/ <link-preview-rule>([\s\S]*?)\/\/ <\/link-preview-rule>/);
  assert.ok(m, "client link preview rule markers");
  return new Function(`${m[1]}; return firstPreviewUrl;`)();
})();
const firstUrlBoth = (text) => {
  const server = lp.firstUrl(text);
  assert.equal(clientRule(text), server, `client and server differ on ${JSON.stringify(text)}`);
  return server;
};

await ok("firstUrl: the first URL, inside text, http and https", () => {
  assert.equal(firstUrlBoth("olha isso https://a.com/x e https://b.com/y"), "https://a.com/x");
  assert.equal(firstUrlBoth("http://example.com/page?q=1"), "http://example.com/page?q=1");
  assert.equal(firstUrlBoth("antes\nhttps://a.com/p\tdepois"), "https://a.com/p");
  assert.equal(firstUrlBoth("<https://a.com/b>"), "https://a.com/b");
  assert.equal(firstUrlBoth("sem link aqui"), null);
  assert.equal(firstUrlBoth("ftp://a.com/x javascript:alert(1)"), null);
  assert.equal(firstUrlBoth("https://"), null);
  assert.equal(firstUrlBoth(""), null);
  assert.equal(firstUrlBoth(null), null);
});
await ok("firstUrl: trailing punctuation and unbalanced parentheses dropped", () => {
  assert.equal(firstUrlBoth("veja https://a.com/x."), "https://a.com/x");
  assert.equal(firstUrlBoth("https://a.com/x?!,;:"), "https://a.com/x");
  assert.equal(firstUrlBoth("(veja https://a.com/x)"), "https://a.com/x");
  assert.equal(firstUrlBoth("(https://a.com/x)."), "https://a.com/x");
  assert.equal(firstUrlBoth("https://pt.wikipedia.org/wiki/Ágora_(Grécia)"), "https://pt.wikipedia.org/wiki/Ágora_(Grécia)");
  assert.equal(firstUrlBoth("\"https://a.com/x\""), "https://a.com/x");
});
await ok("normalizePreviewUrl: http(s) only, no credentials, default ports, no fragment", () => {
  assert.equal(lp.normalizePreviewUrl("https://A.com/x#frag"), "https://a.com/x");
  assert.equal(lp.normalizePreviewUrl("http://a.com:80/"), "http://a.com/");
  assert.equal(lp.normalizePreviewUrl("https://a.com:443/"), "https://a.com/");
  for (const bad of ["ftp://a.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x",
    "https://user:pw@a.com/", "http://a.com:8080/", "https://a.com:22/", "not a url", "", null,
    `https://a.com/${"x".repeat(2100)}`]) {
    assert.equal(lp.normalizePreviewUrl(bad), null, String(bad).slice(0, 40));
  }
  // Odd IPv4 spellings are normalized by the URL parser, then checked as addresses.
  assert.equal(new URL(lp.normalizePreviewUrl("http://0x7f000001/")).hostname, "127.0.0.1");
  assert.equal(new URL(lp.normalizePreviewUrl("http://2130706433/")).hostname, "127.0.0.1");
});
await ok("isPrivateAddress: every private / reserved IPv4 range refused, public allowed", () => {
  const priv = ["0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255",
    "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1",
    "192.0.2.1", "192.88.99.1", "192.168.0.1", "198.18.0.1", "198.19.255.255", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"];
  for (const ip of priv) assert.equal(lp.isPrivateAddress(ip), true, ip);
  const pub = ["8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1",
    "192.167.1.1", "192.169.1.1", "198.17.0.1", "198.20.0.1", "223.255.255.255"];
  for (const ip of pub) assert.equal(lp.isPrivateAddress(ip), false, ip);
});
await ok("isPrivateAddress: IPv6 loopback, ULA, link-local, multicast, mapped, NAT64, 6to4, docs refused", () => {
  const priv = ["::", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0",
    "febf::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1",
    "::ffff:169.254.169.254", "::127.0.0.1", "64:ff9b::7f00:1", "100::1", "2001::1", "2001:db8::1",
    "2002:7f00:1::1", "3fff::1", "garbage", "", null, "1.2.3"];
  for (const ip of priv) assert.equal(lp.isPrivateAddress(ip), true, String(ip));
  for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2a03:2880::1", "::ffff:8.8.8.8"]) {
    assert.equal(lp.isPrivateAddress(ip), false, ip);
  }
  assert.deepEqual(lp.expandIPv6("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  assert.equal(lp.expandIPv6("1::2::3"), null);
});
await ok("guardedLookup: a name with any private address is refused (checked at connect time)", async () => {
  const realLookup = dnsMod.lookup;
  const answers = {
    "public.test": [{ address: "93.184.215.14", family: 4 }],
    "rebind.test": [{ address: "93.184.215.14", family: 4 }, { address: "127.0.0.1", family: 4 }],
    "v6local.test": [{ address: "::1", family: 6 }],
  };
  dnsMod.lookup = (host, opts, cb) => cb(null, answers[host] || []);
  try {
    const run = (host, opts) => new Promise(resolve => lpf.guardedLookup(host, opts, (err, a, f) => resolve({ err, a, f })));
    const one = await run("public.test", {});
    assert.equal(one.err, null);
    assert.equal(one.a, "93.184.215.14");
    assert.equal(one.f, 4);
    const all = await run("public.test", { all: true });
    assert.deepEqual(all.a, answers["public.test"]);
    for (const host of ["rebind.test", "v6local.test", "nothing.test"]) {
      const r = await run(host, {});
      assert.ok(r.err instanceof lpf.PreviewBlockedError, host);
    }
  } finally {
    dnsMod.lookup = realLookup;
  }
});
await ok("fetchPage: literal private addresses refused before any connection", async () => {
  for (const u of ["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/", "http://0x7f000001/", "http://10.1.2.3/"]) {
    await assert.rejects(lpf.fetchPage(u), (e) => e instanceof lpf.PreviewBlockedError, u);
  }
  await assert.rejects(lpf.fetchPage("file:///etc/passwd"), /invalid url/);
});
await ok("detectProvider: YouTube, Spotify, X, Last.fm, Instagram, Telegram, generic", () => {
  const d = lp.detectProvider;
  assert.deepEqual(d("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), { provider: "youtube", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(d("https://youtu.be/dQw4w9WgXcQ?si=x"), { provider: "youtube", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(d("https://m.youtube.com/shorts/dQw4w9WgXcQ"), { provider: "youtube", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(d("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), { provider: "youtube", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(d("https://www.youtube.com/@RickAstleyYT"), { provider: "generic", site: "youtube" });
  for (const kind of ["track", "album", "playlist", "artist", "episode", "show"]) {
    assert.deepEqual(d(`https://open.spotify.com/${kind}/4cOdK2wGLETKBW3PvgPWqT?si=1`), { provider: "spotify", kind, id: "4cOdK2wGLETKBW3PvgPWqT" });
  }
  assert.deepEqual(d("https://open.spotify.com/intl-pt/track/4cOdK2wGLETKBW3PvgPWqT"), { provider: "spotify", kind: "track", id: "4cOdK2wGLETKBW3PvgPWqT" });
  assert.deepEqual(d("https://open.spotify.com/user/abc"), { provider: "generic", site: "spotify" });
  assert.deepEqual(d("https://x.com/jack/status/20"), { provider: "x", statusId: "20" });
  assert.deepEqual(d("https://twitter.com/jack/status/20?s=20"), { provider: "x", statusId: "20" });
  assert.deepEqual(d("https://mobile.twitter.com/jack"), { provider: "x", handle: "jack" });
  assert.deepEqual(d("https://x.com/explore"), { provider: "generic", site: "x" });
  assert.deepEqual(d("https://x.com/search?q=a"), { provider: "generic", site: "x" });
  assert.deepEqual(d("https://www.last.fm/music/Radiohead"), { provider: "lastfm" });
  assert.deepEqual(d("https://www.instagram.com/p/C0Yc3_xLVz1/"), { provider: "instagram" });
  assert.deepEqual(d("https://t.me/durov"), { provider: "telegram" });
  assert.deepEqual(d("https://telegram.me/telegram/1"), { provider: "telegram" });
  assert.deepEqual(d("https://t.me.evil.test/durov"), { provider: "generic" });
  assert.deepEqual(d("https://g1.globo.com/politica/"), { provider: "generic" });
  assert.deepEqual(d("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), { provider: "generic" });
  assert.deepEqual(d("https://x.com.evil.test/jack/status/1"), { provider: "generic" });
  assert.equal(lp.youtubeOembedUrl("dQw4w9WgXcQ"),
    "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json");
  assert.equal(lp.spotifyOembedUrl("track", "4cOdK2wGLETKBW3PvgPWqT"),
    "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4cOdK2wGLETKBW3PvgPWqT");
});
await ok("parseOpenGraph: og tags, attribute order, entities, relative image", () => {
  const html = `<!doctype html><html><head>
    <meta charset="utf-8"><title>Fallback title</title>
    <meta content="Notícia &amp; mais" property="og:title" data-x>
    <meta property='og:description' content='Uma descrição &quot;longa&quot; &#233; &#x1F600;'>
    <meta property="og:site_name"     content="Jornal">
    <meta property="og:image" content="/img/capa.jpg" />
    <meta name="description" content="ignored when og:description exists">
  </head><body><meta property="og:title" content="body tag ignored"></body></html>`;
  assert.deepEqual(lp.parseOpenGraph(html, "https://jornal.test/a/b"), {
    siteName: "Jornal",
    title: "Notícia & mais",
    description: "Uma descrição \"longa\" é 😀",
    image: "https://jornal.test/img/capa.jpg",
  });
});
await ok("parseOpenGraph: without og tags falls back to twitter:*, <title>, meta description", () => {
  const tw = `<head><meta name="twitter:title" content="Tw title"><meta name="twitter:image:src" content="https://cdn.test/i.png"></head>`;
  assert.deepEqual(lp.parseOpenGraph(tw, "https://a.test/"), { siteName: null, title: "Tw title", description: null, image: "https://cdn.test/i.png" });
  const plain = `<html><head><title>
    Só o título </title><meta name="Description" content="Descrição simples"></head></html>`;
  const p = lp.parseOpenGraph(plain, "https://a.test/");
  assert.equal(p.description, "Descrição simples");
  assert.equal(lp.previewResult({ url: "https://a.test/", ...p, provider: "generic" }).title, "Só o título");
  assert.deepEqual(lp.parseOpenGraph("<p>nada</p>", "https://a.test/"), { siteName: null, title: null, description: null, image: null });
  assert.equal(lp.metaCharset('<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">'), "iso-8859-1");
  assert.equal(lp.metaCharset("<meta charset='windows-1252'>"), "windows-1252");
});
await ok("previewResult: normalized shape, text cleaned and clipped, image from allowed hosts only", () => {
  const r = lp.previewResult({
    url: "https://a.test/", siteName: "  Site​  ", title: "a\n\n b‮", description: "d".repeat(400),
    image: "javascript:alert(1)", provider: "weird",
  });
  assert.deepEqual(Object.keys(r), ["url", "siteName", "title", "author", "description", "image", "provider", "publishedAt", "video", "color"]);
  assert.equal(r.siteName, "Site");
  assert.equal(r.title, "a b");
  assert.equal([...r.description].length, 300);
  assert.ok(r.description.endsWith("…"));
  assert.equal(r.image, null);
  assert.equal(r.provider, "generic");
  for (const bad of ["data:image/png;base64,AA", "file:///x.png", "//cdn.test/x.png", 42]) {
    assert.equal(lp.previewResult({ url: "u", image: bad }).image, null, String(bad));
  }
  assert.equal(lp.previewResult({ url: "u", image: "https://i.ytimg.com/vi/x/hqdefault.jpg" }).image, "https://i.ytimg.com/vi/x/hqdefault.jpg");
  assert.equal(lp.previewResult({ url: "u", image: "https://cdn.test/x.png" }).image, null);
  assert.deepEqual(lp.previewResult({ url: "https://www.instagram.com/p/x/", siteName: "Instagram", provider: "instagram" }),
    { url: "https://www.instagram.com/p/x/", siteName: "Instagram", title: null, author: null, description: null, image: null,
      provider: "instagram", publishedAt: null, video: false, color: null });
  assert.equal(lp.hasContent(lp.previewResult({ url: "u", siteName: "S" })), false);
  assert.equal(lp.hostLabel("https://www.example.com/x"), "example.com");
  assert.match(lp.previewCacheId("https://a.test/"), /^[0-9a-f]{64}$/);
  assert.equal(lpf.LP_PREFIX, "ngr:lp:");
  assert.equal(lp.PREVIEW_TTL_SECONDS, 86400);
  assert.equal(lp.PREVIEW_FAIL_TTL_SECONDS, 3600);
  assert.deepEqual(rl.LIMITS.linkPreview, { name: "link-preview", limit: 30, windowMs: 60000 });
});
await ok("preview images: only known platform and news hosts, https, no tricks", () => {
  const good = [
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", "https://yt3.ggpht.com/a.jpg",
    "https://i.scdn.co/image/ab67", "https://image-cdn-ak.spotifycdn.com/image/ab67",
    "https://pbs.twimg.com/media/x.jpg", "https://lastfm-img.freetls.fastly.net/i/u/ar0/a.jpg",
    "https://cdn4.telesco.pe/file/a.jpg", "https://i.imgur.com/a.png", "https://upload.wikimedia.org/a.png",
    "https://s2-g1.glbimg.com/a.jpg", "https://conteudo.imguol.com.br/a.jpg", "https://f.i.uol.com.br/a.jpg",
    "https://i.metroimg.com/a.webp", "https://ichef.bbci.co.uk/a.jpg", "https://i.guim.co.uk/a.jpg",
    "https://static01.nyt.com/a.jpg", "https://imagenes.elpais.com/a.png", "https://I.YTIMG.COM./a.jpg",
  ];
  for (const u of good) assert.ok(lp.safeImageUrl(u), u);
  const bad = [
    "http://i.ytimg.com/a.jpg",                 // https only
    "https://evil.test/a.jpg",                  // unknown host
    "https://ytimg.com.evil.test/a.jpg",        // suffix trick
    "https://evilytimg.com/a.jpg",              // no dot boundary
    "https://storage.googleapis.com/b/a.png",   // shared bucket host
    "https://freetls.fastly.net/a.png",         // shared CDN, only Last.fm's hosts
    "https://x.uol.com.br/a.jpg",               // only f.i.uol.com.br and imguol.com.br
    "https://user:pw@i.ytimg.com/a.jpg", "https://i.ytimg.com:8443/a.jpg",
    "https://lh3.googleusercontent.com.evil.test/a.jpg", "javascript:alert(1)", null,
  ];
  for (const u of bad) assert.equal(lp.safeImageUrl(u), null, String(u));
  assert.equal(lp.isPreviewImageHost("evil.test"), false);
  assert.equal(lp.isPreviewImageHost(""), false);
  // No shared hosting domain may ever sneak into the list.
  for (const shared of ["googleapis.com", "storage.googleapis.com", "amazonaws.com", "akamaihd.net", "arc.pub",
    "fastly.net", "freetls.fastly.net", "cloudfront.net", "wordpress.com", "github.io", "vercel.app", "netlify.app",
    "pages.dev", "googleusercontent.com", "githubusercontent.com", "blogspot.com", "uol.com.br"]) {
    assert.ok(!lp.PREVIEW_IMAGE_HOSTS.includes(shared), shared);
  }
});

await ok("previewResult: author, date, video and color are checked like the rest", () => {
  const r = lp.previewResult({
    url: "u", author: "  Rádio\u200b  Nova ", publishedAt: "2026-11-20T10:00:00-03:00", video: "yes", color: "#ABC",
  });
  assert.equal(r.author, "Rádio Nova");
  assert.equal(r.publishedAt, "2026-11-20T13:00:00.000Z");
  assert.equal(r.video, false, "only a real true counts");
  assert.equal(r.color, "#aabbcc");
  assert.equal(lp.previewResult({ url: "u", video: true }).video, true);
  for (const bad of ["red", "rgb(1,2,3)", "#12345", "#ggg", "url(https://a.test/x)", "#fff;background:url(x)", 7]) {
    assert.equal(lp.previewResult({ url: "u", color: bad }).color, null, String(bad));
  }
  for (const bad of ["https://jornal.test/autor/x", "//a.test/b", "www.a.test", "", "   "]) {
    assert.equal(lp.previewResult({ url: "u", author: bad }).author, null, bad);
  }
  assert.equal(lp.previewResult({ url: "u", author: "a".repeat(200) }).author.length, 80);
  const now = Date.UTC(2026, 10, 26);
  assert.equal(lp.safePublishedAt("1980-01-01", now), null);
  assert.equal(lp.safePublishedAt("2026-12-30", now), null, "more than a day ahead");
  assert.equal(lp.safePublishedAt("ontem", now), null);
  assert.equal(lp.safePublishedAt(Date.UTC(2026, 0, 2), now), "2026-01-02T00:00:00.000Z");
});
await ok("parseMetaTags / pageExtras: author, published time, video, theme-color", () => {
  const html = `<head>
    <meta name="author" content="Fulana de Tal"><meta property="article:author" content="https://site.test/autor">
    <meta property="article:published_time" content="2026-11-25T08:30:00Z">
    <meta property="og:type" content="video.other"><meta name="theme-color" content="#C4170C">
  </head><body><meta name="author" content="ignored"></body>`;
  const meta = lp.parseMetaTags(html);
  assert.equal(meta.author, "Fulana de Tal");
  assert.deepEqual(lp.pageExtras(meta), { author: "Fulana de Tal", publishedAt: "2026-11-25T08:30:00.000Z", video: true, color: "#c4170c" });
  // A URL author falls back to nothing; twitter:card player and og:video mark a video.
  assert.deepEqual(lp.pageExtras(lp.parseMetaTags('<meta property="article:author" content="https://a.test/u"><meta name="twitter:card" content="player">')),
    { author: null, publishedAt: null, video: true, color: null });
  assert.equal(lp.pageExtras(lp.parseMetaTags('<meta property="og:video:secure_url" content="https://v.test/a.mp4">')).video, true);
  assert.deepEqual(lp.pageExtras({}), { author: null, publishedAt: null, video: false, color: null });
  // parseOpenGraph still returns only its four fields.
  assert.deepEqual(Object.keys(lp.parseOpenGraph(html, "https://a.test/")), ["siteName", "title", "description", "image"]);
});
await ok("spotifyDetails: artist and year for tracks and albums, page text for artists and playlists", () => {
  const track = lp.parseMetaTags(`<head><meta property="og:description" content="Radiohead · Pablo Honey · Song · 1993">
    <meta name="music:musician_description" content="Radiohead"><meta name="music:release_date" content="1993-02-22"></head>`);
  assert.deepEqual(lp.spotifyDetails("track", track), { author: "Radiohead", description: "Música · 1993" });
  // Without music:musician_description the artist is the first part of og:description.
  assert.deepEqual(lp.spotifyDetails("album", { "og:description": "Tim Maia · Album · 1971 · 12 songs." }),
    { author: "Tim Maia", description: "Álbum" });
  assert.deepEqual(lp.spotifyDetails("track", {}), { author: null, description: "Música" });
  assert.deepEqual(lp.spotifyDetails("track", { "og:description": "Ouça no Spotify." }), { author: null, description: "Música" });
  assert.deepEqual(lp.spotifyDetails("artist", { "og:description": "Artista · 1,2 mi ouvintes mensais." }),
    { author: null, description: "Artista · 1,2 mi ouvintes mensais." });
  assert.deepEqual(lp.spotifyDetails("playlist", null), { author: null, description: "Playlist" });
  assert.deepEqual(lp.spotifyDetails("episode", { "music:release_date": "2025-03-01" }), { author: null, description: "Episódio · 2025" });
  // A URL never becomes the artist.
  assert.equal(lp.spotifyDetails("track", { "music:musician_description": "https://open.spotify.com/artist/x" }).author, null);
});
await ok("previewCacheId: versioned, so entries in the old shape are not served", () => {
  const old = createHash("sha256").update("https://a.test/").digest("hex");
  assert.notEqual(lp.previewCacheId("https://a.test/"), old);
  assert.equal(lp.previewCacheId("https://a.test/"),
    createHash("sha256").update(`${lp.PREVIEW_CACHE_VERSION} https://a.test/`).digest("hex"));
});

console.log("captions:");
const msgs = await import("../lib/messages.js");
await ok("parseCaption: trimmed text, empty for none, refused over 2000 characters", () => {
  assert.deepEqual(msgs.parseCaption("  olha isso \n "), { valid: true, text: "olha isso" });
  for (const none of [undefined, null, "", "   ", 42, {}, ["x"]]) {
    assert.deepEqual(msgs.parseCaption(none), { valid: true, text: "" }, String(none));
  }
  assert.equal(msgs.CAPTION_MAX_LENGTH, 2000);
  assert.deepEqual(msgs.parseCaption("a".repeat(2000)), { valid: true, text: "a".repeat(2000) });
  assert.deepEqual(msgs.parseCaption("a".repeat(2001)), { valid: false, text: "" });
  assert.deepEqual(msgs.parseCaption(`  ${"a".repeat(2000)}  `).valid, true, "counted after trimming");
  // The client field allows the same length.
  const src = readFileSync(new URL("../js/UGqaIF1Z55PgcI4.js", import.meta.url), "utf8");
  assert.match(src, /id="img-preview-caption"[^>]*maxlength="2000"/);
});

console.log(`\nAll ${passed} tests passed.`);
