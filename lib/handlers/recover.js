/**
 * /api/recover — password recovery by emailed code. POST only, no session
 * (same gate as login: same-origin, no CORS headers).
 *
 *   { action: "start", identifier }                       username (with or without "@") or email
 *   { action: "confirm", identifier, code, newPassword }
 *
 * No user enumeration: "start" always answers { ok: true } at the same moment,
 * whether or not the account exists, has a verified email or is rate limited.
 * "confirm" has one error for a wrong code, an expired code and an unknown
 * account. Without email configuration both answer 503.
 */
import { query } from "../../lib/db.js";
import { hashPassword } from "../../lib/password.js";
import { generateApiKey, generateAuthKey } from "../../lib/apikey.js";
import { isFromNagora } from "../../lib/auth.js";
import { serializeCookie, isSecureRequest } from "../../lib/cookie.js";
import { normalizeEmail, isValidEmail, passwordProblem, EMAIL_MAX_LENGTH } from "../../lib/validate.js";
import { issueCode, verifyCode } from "../../lib/codes.js";
import { emailConfigured, sendEmail, recoverMessage, passwordChangedMessage, EMAIL_UNAVAILABLE } from "../../lib/email.js";
import { LIMITS, MESSAGES, clientIp, hitWindow, hitCooldown, peekWindow, resetWindow, tooManyRequests } from "../../lib/ratelimit.js";

const PURPOSE = "recover";
const INVALID_CODE = "Invalid or expired code";
const START_RESPONSE_MS = 1200; // "start" answers at this mark, whatever it did
const FAIL_RESPONSE_MS = 600;   // floor for a failed "confirm"

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

/** Vercel's waitUntil (what @vercel/functions wraps), or null elsewhere. */
function backgroundRunner() {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
    return typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : null;
  } catch {
    return null;
  }
}

const ACCOUNT_COLUMNS = "id, username, user_id, email";

/** The account for a username (leading "@" tolerated, case-insensitive when unambiguous) or a verified email. */
async function findRecoveryAccount(identifier) {
  const raw = typeof identifier === "string" ? identifier.trim() : "";
  if (!raw || raw.length > EMAIL_MAX_LENGTH) return null;

  const email = normalizeEmail(raw);
  if (isValidEmail(email)) {
    const { rows } = await query(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE lower(email) = $1`, [email]);
    if (rows[0]) return rows[0];
  }

  const bare = raw.replace(/^@+/, "");
  const names = [...new Set([raw, bare].filter(Boolean).map(n => n.toLowerCase()))];
  const { rows } = await query(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE lower(username) = ANY($1::text[]) ORDER BY id`,
    [names]
  );
  return rows.find(r => r.username === raw)
    || rows.find(r => r.username === bare)
    || (rows.length === 1 ? rows[0] : null);
}

/** Everything "start" does besides answering. Never throws to the caller. */
async function sendRecoveryCode(req, identifier) {
  const ip = await hitWindow(LIMITS.recoverIp, clientIp(req));
  if (!ip.allowed) return;

  const account = await findRecoveryAccount(identifier);
  if (!account?.user_id || !account.email) return;

  if (!(await hitWindow(LIMITS.recoverAccount, account.user_id)).allowed) return;
  if (!(await hitCooldown(LIMITS.emailSendCooldown, `${account.user_id}:${PURPOSE}`)).allowed) return;
  if (!(await hitWindow(LIMITS.emailSendHour, account.user_id)).allowed) return;

  const code = await issueCode(PURPOSE, account.user_id);
  await sendEmail({ to: account.email, ...recoverMessage({ username: account.username, code }) });
}

async function recoverStart(req, res) {
  const startedAt = Date.now();
  const identifier = req.body?.identifier;
  if (typeof identifier !== "string" || !identifier.trim()) {
    return res.status(400).json({ ok: false, error: "Missing username or email" });
  }

  const work = sendRecoveryCode(req, identifier)
    .catch(err => console.error("[api/recover] start:", err?.message || err));

  // Answer at a fixed mark. On Vercel the work goes on after the response; where
  // that is not possible it is awaited, so it is never cut short.
  const runInBackground = backgroundRunner();
  if (runInBackground) runInBackground(work);
  else await work;
  await sleep(startedAt + START_RESPONSE_MS - Date.now());

  res.status(200).json({ ok: true });
}

async function recoverConfirm(req, res) {
  const startedAt = Date.now();
  const { identifier, code, newPassword } = req.body || {};

  // Checked first: a password that breaks the rules does not use up an attempt.
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ ok: false, error: problem });

  const ip = clientIp(req);
  const gate = await peekWindow(LIMITS.recoverConfirmFail, ip);
  if (!gate.allowed) return tooManyRequests(res, gate, MESSAGES.recoverConfirm);

  const fail = async () => {
    await hitWindow(LIMITS.recoverConfirmFail, ip);
    await sleep(startedAt + FAIL_RESPONSE_MS - Date.now());
    res.status(400).json({ ok: false, error: INVALID_CODE });
  };

  const account = await findRecoveryAccount(identifier);
  if (!account?.user_id || !account.email) return fail();

  const result = await verifyCode(PURPOSE, account.user_id, String(code ?? "").trim());
  if (!result.ok) return fail();

  // New password, new api_key (every session dies with the old one) and the
  // auth_key derived from it, written together.
  const passHash = await hashPassword(String(newPassword));
  const apiKey = generateApiKey();
  const authKey = generateAuthKey(account.user_id, apiKey);
  await query(
    "UPDATE accounts SET pass_hash = $1, api_key = $2, auth_key = $3, last_ping_at = NULL WHERE id = $4",
    [passHash, apiKey, authKey, account.id]
  );

  res.setHeader("Set-Cookie", serializeCookie("nagora_session", "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 0,
    secure: isSecureRequest(req),
  }));

  await resetWindow(LIMITS.loginFail, `${ip}:${account.username.toLowerCase()}`);

  try {
    await sendEmail({ to: account.email, ...passwordChangedMessage({ username: account.username }) });
  } catch (err) {
    console.error("[api/recover] notice failed:", err?.message || err);
  }

  res.status(200).json({ ok: true, username: account.username });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ ok: false, error: "Method not allowed" }); return; }
  if (!isFromNagora(req))      { res.status(403).json({ ok: false, error: "Forbidden" }); return; }
  if (!emailConfigured())      { res.status(503).json({ ok: false, error: EMAIL_UNAVAILABLE }); return; }

  try {
    const action = req.body?.action;
    if (action === "start")   return await recoverStart(req, res);
    if (action === "confirm") return await recoverConfirm(req, res);
    res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error("[api/recover]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
