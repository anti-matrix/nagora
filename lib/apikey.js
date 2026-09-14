const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const N = CHARSET.length;
const KEY = process.env.API_KEY_SEED;

if (!KEY) {
  throw new Error("API_KEY_SEED env var is required");
}

function keySalts(key) {
  if (!key) throw new Error("key must not be empty");
  return Array.from(key, (c) => {
    const i = CHARSET.indexOf(c);
    return i === -1 ? 0 : i;
  });
}

export function encrypt(plaintext, key = KEY) {
  const salts = keySalts(key);
  let out = "";
  for (let i = 0; i < plaintext.length; i++) {
    const c = plaintext[i];
    const idx = CHARSET.indexOf(c);
    if (idx === -1) { out += c; continue; }
    const salt = salts[i % salts.length];
    out += CHARSET[(idx + salt) % N];
  }
  return out;
}

export function generateApiKey(username, userId) {
  const plaintext = String(username || "") + String(userId || "");
  return "ngr-" + encrypt(plaintext, KEY);
}
