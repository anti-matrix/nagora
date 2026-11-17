/**
 * /api/email — the caller's own verified email. POST only.
 *
 *   { action: "start", email, password }  send a 6-digit code to a new address
 *   { action: "confirm", code }           confirm it: writes accounts.email + email_verified_at
 *   { action: "remove", password }        clear both columns
 *
 * "start" and "remove" need the current password: a stolen session alone can
 * neither add, replace nor remove the address. When an address is replaced,
 * the old one is told after the new one is confirmed.
 *
 * accounts.email only ever holds a verified address; the pending one lives in
 * Redis with its code (lib/codes.js). "start" answers the same way whether the
 * address is free or already verified on another account: the response never
 * says which. Without email configuration "start" and "confirm" answer 503;
 * "remove" sends nothing and keeps working.
 */
import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import { verifyPassword } from "../../lib/password.js";
import { normalizeEmail, isValidEmail } from "../../lib/validate.js";
import { issueCode, verifyCode, clearCode, CODE_TTL_SEC } from "../../lib/codes.js";
import {
  emailConfigured, sendEmail, verifyEmailMessage, emailTakenMessage, emailChangedMessage,
  EMAIL_UNAVAILABLE, EMAIL_SEND_FAILED,
} from "../../lib/email.js";
import { LIMITS, MESSAGES, clientIp, hitWindow, hitCooldown, peekWindow, tooManyRequests } from "../../lib/ratelimit.js";

const PURPOSE = "verify_email";
const INVALID_CODE = "Invalid or expired code";

function unavailable(res) {
  res.status(503).json({ ok: false, error: EMAIL_UNAVAILABLE });
}

/**
 * Checks req.body.password against the caller's current password. Answers 403
 * (or 429) itself and returns false when it does not match. Wrong passwords
 * count against the same allowance as failed logins.
 */
async function requireCurrentPassword(req, res) {
  const me = req.account;
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const failKey = `${clientIp(req)}:${me.username.toLowerCase()}`;
  const gate = await peekWindow(LIMITS.loginFail, failKey);
  if (!gate.allowed) {
    tooManyRequests(res, gate, MESSAGES.password);
    return false;
  }

  const { rows: [row] } = await query("SELECT pass_hash FROM accounts WHERE id = $1", [me.id]);
  if (!password || !row || !(await verifyPassword(password, row.pass_hash))) {
    await hitWindow(LIMITS.loginFail, failKey);
    res.status(403).json({ ok: false, error: "Invalid password" });
    return false;
  }
  return true;
}

async function startEmail(req, res) {
  if (!emailConfigured()) return unavailable(res);

  const me = req.account;
  if (!me.user_id) return res.status(400).json({ ok: false, error: "Account is not initialized" });

  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "Invalid email address" });

  // Needed for the first address as much as for a replacement.
  if (!(await requireCurrentPassword(req, res))) return;

  // The caller's own data, so this answer reveals nothing about anyone else.
  const { rows: [own] } = await query("SELECT email FROM accounts WHERE id = $1", [me.id]);
  if (own?.email === email) {
    return res.status(409).json({ ok: false, error: "This email is already verified on your account" });
  }

  const cooldown = await hitCooldown(LIMITS.emailSendCooldown, `${me.user_id}:${PURPOSE}`);
  if (!cooldown.allowed) return tooManyRequests(res, cooldown, MESSAGES.emailCooldown);
  const perHour = await hitWindow(LIMITS.emailSendHour, me.user_id);
  if (!perHour.allowed) return tooManyRequests(res, perHour, MESSAGES.emailHour);

  const { rows: taken } = await query(
    "SELECT 1 FROM accounts WHERE lower(email) = $1 AND id <> $2 LIMIT 1",
    [email, me.id]
  );

  // A code is issued either way, so the pending state and every later request
  // look the same. For a taken address the code is never sent to anyone: that
  // address gets a short notice instead.
  const code = await issueCode(PURPOSE, me.user_id, { email });
  const message = taken.length ? emailTakenMessage() : verifyEmailMessage({ username: me.username, code });

  // Sent before answering: nothing is left running after the response.
  try {
    await sendEmail({ to: email, ...message });
  } catch (err) {
    console.error("[api/email] send failed:", err?.message || err);
    await clearCode(PURPOSE, me.user_id);
    return res.status(502).json({ ok: false, error: EMAIL_SEND_FAILED });
  }

  res.status(200).json({
    ok: true,
    pendingEmail: email,
    cooldownSec: Math.ceil(LIMITS.emailSendCooldown.ms / 1000),
    expiresInSec: CODE_TTL_SEC,
  });
}

async function confirmEmail(req, res) {
  if (!emailConfigured()) return unavailable(res);

  const me = req.account;
  const result = await verifyCode(PURPOSE, me.user_id, String(req.body?.code ?? "").trim());
  const email = result.ok ? normalizeEmail(result.extra?.email) : "";
  if (!result.ok || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: INVALID_CODE });
  }

  let row;
  try {
    ({ rows: [row] } = await query(
      `WITH previous AS (SELECT email FROM accounts WHERE id = $2)
       UPDATE accounts SET email = $1, email_verified_at = now()
       WHERE id = $2
       RETURNING email, email_verified_at, (SELECT email FROM previous) AS previous_email`,
      [email, me.id]
    ));
  } catch (err) {
    // Another account verified this address in the meantime: same answer as a wrong code.
    if (err.code === "23505") return res.status(400).json({ ok: false, error: INVALID_CODE });
    throw err;
  }

  // A replaced address is told, after the new one is confirmed. Awaited so it
  // is not cut off; a failure does not undo the change.
  if (row.previous_email && row.previous_email !== row.email) {
    try {
      await sendEmail({
        to: row.previous_email,
        ...emailChangedMessage({ username: me.username, changedAt: row.email_verified_at }),
      });
    } catch (err) {
      console.error("[api/email] change notice failed:", err?.message || err);
    }
  }

  res.status(200).json({ ok: true, email: row.email, emailVerified: true, emailVerifiedAt: row.email_verified_at });
}

/** Sends no email, so it works whether or not email is configured. */
async function removeEmail(req, res) {
  if (!(await requireCurrentPassword(req, res))) return;

  await query("UPDATE accounts SET email = NULL, email_verified_at = NULL WHERE id = $1", [req.account.id]);
  res.status(200).json({ ok: true, email: null, emailVerified: false });
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const action = req.body?.action;
    if (action === "start") return await startEmail(req, res);
    if (action === "confirm") return await confirmEmail(req, res);
    if (action === "remove") return await removeEmail(req, res);
    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error("[api/email]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export default requireClientToken(handler);
