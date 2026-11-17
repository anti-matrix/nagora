/**
 * lib/codes.js — six-digit email codes (verify_email, recover).
 *
 * Redis holds, for 10 minutes, under `ngr:code:<purpose>:<subject>`:
 *   { hash, extra }  hash = HMAC-SHA256(EMAIL_CODE_SECRET, purpose:subject:code)
 * and an attempt counter under `...:tries`. The plaintext code exists only in
 * the return value of issueCode() (to be emailed) and is never stored, logged
 * or sent in a response.
 *
 * EMAIL_CODE_SECRET is used for nothing else, and no other secret is used here.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { kv, NS } from "./redis.js";

export const CODE_TTL_SEC = 10 * 60;
export const MAX_ATTEMPTS = 5;
export const PURPOSES = ["verify_email", "recover"];

// ── Pure parts (unit-tested) ──────────────────────────────────────────────

/** Six digits, zero-padded, from the CSPRNG. */
export function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function isCodeFormat(code) {
  return typeof code === "string" && /^[0-9]{6}$/.test(code);
}

export function hashCode(purpose, subject, code, secret = process.env.EMAIL_CODE_SECRET) {
  if (!secret) throw new Error("EMAIL_CODE_SECRET env var is required");
  return createHmac("sha256", secret).update(`${purpose}:${subject}:${code}`).digest("hex");
}

export function codeKey(purpose, subject) {
  return `${NS}code:${purpose}:${subject}`;
}

function triesKey(purpose, subject) {
  return `${codeKey(purpose, subject)}:tries`;
}

function sameHash(a, b) {
  const x = Buffer.from(String(a), "hex");
  const y = Buffer.from(String(b), "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verdict for attempt number `attempt` (1-based, already counted).
 * `burn` = the stored code must be deleted now: it was used, or this was the
 * last allowed attempt. An attempt beyond MAX_ATTEMPTS never succeeds.
 */
export function judgeAttempt(storedHash, candidateHash, attempt) {
  if (!(attempt >= 1) || attempt > MAX_ATTEMPTS) return { ok: false, burn: true };
  const ok = sameHash(storedHash, candidateHash);
  return { ok, burn: ok || attempt >= MAX_ATTEMPTS };
}

// ── Redis-backed ──────────────────────────────────────────────────────────

/**
 * Creates a code for (purpose, subject), replacing any previous one, and
 * returns the plaintext so the caller can email it. `extra` is stored beside
 * the hash (for example { email } for a pending address).
 */
export async function issueCode(purpose, subject, extra = null) {
  if (!PURPOSES.includes(purpose)) throw new Error(`Unknown code purpose "${purpose}"`);
  if (!subject) throw new Error("issueCode needs a subject");

  const code = generateCode();
  const hash = hashCode(purpose, subject, code);
  await kv.set(triesKey(purpose, subject), 0, { ex: CODE_TTL_SEC });
  await kv.set(codeKey(purpose, subject), { hash, extra }, { ex: CODE_TTL_SEC });
  return code;
}

/**
 * Checks a code. { ok: true, extra } once, for the right code, within 10
 * minutes and within 5 attempts; { ok: false } for everything else (wrong,
 * expired, used, never issued — callers must not tell these apart to the user).
 */
export async function verifyCode(purpose, subject, code) {
  if (!subject || !isCodeFormat(code)) return { ok: false };

  const key = codeKey(purpose, subject);
  const record = await kv.get(key);
  if (!record?.hash) return { ok: false };

  // Counted atomically before comparing, so parallel guesses cannot exceed the cap.
  const attempt = await kv.incr(triesKey(purpose, subject));
  const verdict = judgeAttempt(record.hash, hashCode(purpose, subject, code), attempt);

  if (verdict.burn) {
    const removed = await kv.del(key);
    await kv.del(triesKey(purpose, subject));
    // Single use: of two simultaneous correct submissions only the one that deleted the key wins.
    if (verdict.ok && !removed) return { ok: false };
  }
  return verdict.ok ? { ok: true, extra: record.extra ?? null } : { ok: false };
}

/** The `extra` of a live code (for example the pending email), or null. Never the hash. */
export async function peekCodeExtra(purpose, subject) {
  if (!subject) return null;
  const record = await kv.get(codeKey(purpose, subject));
  return record?.hash ? (record.extra ?? null) : null;
}

export async function clearCode(purpose, subject) {
  if (!subject) return;
  await kv.del(codeKey(purpose, subject));
  await kv.del(triesKey(purpose, subject));
}
