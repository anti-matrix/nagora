/**
 * lib/ratelimit.js — small Redis rate limiter (Upstash), keys under `ngr:rl:`.
 *
 * Two primitives:
 *   - fixed window: at most `limit` hits per `windowMs` (INCR on a per-window key)
 *   - cooldown:     at most one hit per `ms` (SET NX PX)
 * If Redis is unreachable the limiter FAILS OPEN (request allowed) and logs it.
 *
 * Usage in a handler:
 *   const verdict = await hitWindow(LIMITS.roomPostMinute, req.account.user_id);
 *   if (!verdict.allowed) return tooManyRequests(res, verdict);
 */
import { kv, NS } from "./redis.js";

export const RL_PREFIX = `${NS}rl:`;

/** Every limit in the app, in one place. */
export const LIMITS = {
  roomPostCooldown: { name: "room-post-cd", ms: 1500 },
  roomPostMinute:   { name: "room-post", limit: 20, windowMs: 60 * 1000 },
  roomReact:        { name: "room-react", limit: 30, windowMs: 60 * 1000 },
  signup:           { name: "signup", limit: 5, windowMs: 60 * 60 * 1000 },
  loginFail:        { name: "login-fail", limit: 10, windowMs: 15 * 60 * 1000 },
};

export const MESSAGES = {
  slowDown: "Você está enviando mensagens rápido demais. Aguarde um instante.",
  roomPost: "Limite de mensagens atingido. Aguarde um minuto e tente de novo.",
  roomReact: "Limite de reações atingido. Aguarde um minuto e tente de novo.",
  signup: "Muitas contas criadas a partir desta rede. Tente novamente mais tarde.",
  login: "Muitas tentativas de login. Tente novamente em alguns minutos.",
};

// ── Pure window math (unit-tested) ────────────────────────────────────────

export function windowStart(now, windowMs) {
  return Math.floor(now / windowMs) * windowMs;
}

/** Milliseconds until the window containing `now` ends (1..windowMs). */
export function windowRemainingMs(now, windowMs) {
  return windowStart(now, windowMs) + windowMs - now;
}

export function windowKey(name, id, now, windowMs) {
  return `${RL_PREFIX}${name}:${id}:${Math.floor(now / windowMs)}`;
}

export function cooldownKey(name, id) {
  return `${RL_PREFIX}${name}:${id}`;
}

/** Verdict for a window whose counter is `count` AFTER counting this hit. */
export function decide(count, limit, now, windowMs) {
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil(windowRemainingMs(now, windowMs) / 1000)),
  };
}

/** First x-forwarded-for hop (Vercel sets it to the client address). */
export function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim();
  return first || req?.headers?.["x-real-ip"] || req?.socket?.remoteAddress || "unknown";
}

// ── Redis-backed primitives ───────────────────────────────────────────────

const OPEN = { allowed: true, remaining: 0, retryAfterSec: 0, failedOpen: true };

function failOpen(what, err) {
  console.error(`[ratelimit] ${what} failed, allowing the request:`, err?.message || err);
  return OPEN;
}

/** Count one hit against a fixed window and return the verdict. */
export async function hitWindow({ name, limit, windowMs }, id, now = Date.now()) {
  try {
    const key = windowKey(name, id, now, windowMs);
    const count = await kv.incr(key);
    if (count === 1) await kv.pexpire(key, windowMs);
    return decide(count, limit, now, windowMs);
  } catch (err) {
    return failOpen(`hitWindow(${name})`, err);
  }
}

/** Verdict for the current window WITHOUT counting a hit (blocked once `limit` is reached). */
export async function peekWindow({ name, limit, windowMs }, id, now = Date.now()) {
  try {
    const count = Number(await kv.get(windowKey(name, id, now, windowMs))) || 0;
    return decide(count + 1, limit, now, windowMs);
  } catch (err) {
    return failOpen(`peekWindow(${name})`, err);
  }
}

/** Allow one hit per `ms`. */
export async function hitCooldown({ name, ms }, id) {
  try {
    const set = await kv.set(cooldownKey(name, id), 1, { nx: true, px: ms });
    if (set) return { allowed: true, remaining: 0, retryAfterSec: 0 };
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(ms / 1000)) };
  } catch (err) {
    return failOpen(`hitCooldown(${name})`, err);
  }
}

/** 429 with a pt-BR message (these are shown to the user as-is). */
export function tooManyRequests(res, verdict, message) {
  if (verdict?.retryAfterSec) res.setHeader("Retry-After", String(verdict.retryAfterSec));
  res.status(429).json({ ok: false, error: message, retryAfterSec: verdict?.retryAfterSec || 0 });
}
