/**
 * lib/strenc.js — One-way, randomized string mixer.
 * Output is NOT reversible and differs on every run (random salt per char).
 */

const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const N = CHARSET.length; // 62

function randIntInclusive(max) {
  return Math.floor(Math.random() * (max + 1));
}

export function mixChar(c) {
  let ch = c;
  if (!CHARSET.includes(ch)) ch = "X";

  const idx  = CHARSET.indexOf(ch);
  const salt = randIntInclusive(61);
  const mixed = (idx ^ (salt + 13)) % N;

  return CHARSET[mixed];
}

export function encryptLayer(text, targetLen = 7) {
  let t = text;
  if (!t) t = "X";

  let result = "";
  for (const c of t) result += mixChar(c);

  while (result.length < targetLen) {
    result += mixChar(result[result.length - 1]);
  }

  return result.slice(0, targetLen);
}

export function doubleEncrypt(text) {
  const layer1 = encryptLayer(text, 7);
  const layer2 = encryptLayer(layer1, 7);
  const randomChar = CHARSET[randIntInclusive(61)];

  return layer1 + layer2 + randomChar;
}
