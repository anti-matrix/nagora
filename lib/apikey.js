import { randomBytes, randomInt, createHash } from "node:crypto";

const API_KEY_PREFIX = "ngr-";
export const AUTH_KEY_PREFIX = "ngr-ath-";

export function generateApiKey() {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

/**
 * Session credential stored in the nagora_session cookie:
 * "ngr-ath-" + sha256(4 random chars of userId + the first X chars of the
 * api_key body, X random in [6, full length]).
 */
export function generateAuthKey(userId, apiKey) {
  const uid = String(userId ?? "");
  const body = String(apiKey ?? "").slice(API_KEY_PREFIX.length);
  if (!uid || body.length < 6) throw new Error("generateAuthKey needs a userId and an api_key");

  let uidPart = "";
  for (let i = 0; i < 4; i++) uidPart += uid[randomInt(uid.length)];

  const keyPart = body.slice(0, randomInt(6, body.length + 1));

  const hash = createHash("sha256").update(uidPart + keyPart).digest("hex");
  return AUTH_KEY_PREFIX + hash;
}
