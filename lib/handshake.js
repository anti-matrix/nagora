import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const CLOCK_SKEW_S = 60;

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function b64urlDecode(str) {
  return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
}

/**
 * The token is bound to the account's auth_key through the signature only:
 * HMAC(API_KEY_SEED, auth_key + "." + payload). auth_key never leaves the
 * server and nothing derived from it appears in the token.
 */
function sign(seed, authKey, payloadPart) {
  return createHmac("sha256", seed).update(`${authKey}.${payloadPart}`).digest();
}

export function signClientToken(account) {
  const seed = process.env.API_KEY_SEED;
  if (!seed) throw new Error("API_KEY_SEED env var is required");
  if (!account?.auth_key) throw new Error("Account has no auth_key");

  const now = Date.now();
  const payload = {
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL_MS) / 1000),
  };

  const payloadPart = b64urlEncode(payload);
  return `${payloadPart}.${sign(seed, account.auth_key, payloadPart).toString("base64url")}`;
}

/** Returns the payload when `token` was signed for this account's auth_key, else null. */
export function verifyClientToken(token, account) {
  const seed = process.env.API_KEY_SEED;
  if (!seed || !account?.auth_key) return null;

  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) return null;

  const expected = sign(seed, account.auth_key, payloadPart);
  const actual = Buffer.from(sigPart, "base64url");
  if (actual.length !== expected.length) return null;
  if (!timingSafeEqual(actual, expected)) return null;

  let payload;
  try {
    payload = b64urlDecode(payloadPart);
  } catch {
    return null;
  }

  if (!payload || typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    return null;
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (payload.iat > nowS + CLOCK_SKEW_S) return null;
  if (nowS >= payload.exp) return null;

  return payload;
}
