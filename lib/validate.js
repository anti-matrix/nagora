/**
 * lib/validate.js — pure input rules shared by handlers. No I/O.
 */

export const EMAIL_MAX_LENGTH = 254;

// The HTML5 email grammar on a lowercased address, plus at least one dot in the
// domain. ASCII only: no spaces, no control characters, no header injection.
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Trimmed and lowercased; "" for anything that is not a string. */
export function normalizeEmail(input) {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

/** True for a NORMALIZED address of at most 254 characters. */
export function isValidEmail(email) {
  return typeof email === "string"
    && email.length > 0
    && email.length <= EMAIL_MAX_LENGTH
    && email.indexOf("@") <= 64
    && EMAIL_RE.test(email);
}

const HAS_LETTER = /[A-Za-z]/;
const HAS_NUMBER = /[0-9]/;

/** The signup password rules. Returns the error sentence, or null when valid. */
export function passwordProblem(password) {
  const value = String(password ?? "");
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!HAS_LETTER.test(value) || !HAS_NUMBER.test(value)) return "Password must contain letters and numbers";
  return null;
}
