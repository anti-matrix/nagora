import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function b64urlDecode(str) {
  return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
}

export function signClientToken(account) {
  const seed = process.env.API_KEY_SEED;
  if (!seed) throw new Error("API_KEY_SEED env var is required");

  const now = Date.now();
  const payload = {
    sub: account.user_id,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL_MS) / 1000),
  };

  const payloadPart = b64urlEncode(payload);
  const sig = createHmac("sha256", seed).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

export function verifyClientToken(token) {
  const seed = process.env.API_KEY_SEED;
  if (!seed) return null;

  if (typeof token !== "string" || token.split(".").length !== 2) return null;
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) return null;

  let payload;
  try {
    payload = b64urlDecode(payloadPart);
  } catch {
    return null;
  }

  if (!payload ||
      (payload.sub !== null && typeof payload.sub !== "string") ||
      typeof payload.exp !== "number") {
    return null;
  }

  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    return null;
  }

  const expected = createHmac("sha256", seed).update(payloadPart).digest();
  const actual = Buffer.from(sigPart, "base64url");
  if (actual.length !== expected.length) return null;

  if (!timingSafeEqual(actual, expected)) return null;
  return payload;
}
