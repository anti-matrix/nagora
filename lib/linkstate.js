/**
 * lib/linkstate.js — the signed state of a Last.fm / Steam link flow.
 *
 * Last.fm's callback must be registered without query parameters and Last.fm
 * only appends ?token=..., so the state travels in a short-lived HttpOnly
 * cookie set by POST /api/integrations {action:"start"}. The cookie is
 * SameSite=Lax (sent on the provider's top-level redirect back), scoped to
 * /api, 10 minutes. The callback checks: signature, expiry, the session's
 * user, the provider, and that its nonce was never spent (Redis, once).
 */
import { randomBytes } from "node:crypto";
import { parseCookies, serializeCookie, isSecureRequest } from "./cookie.js";
import { stateKey, signState, verifyState, STATE_TTL_MS } from "./integrations.js";
import { spendStateNonce } from "./providers.js";

export const STATE_COOKIE = "ngr_int_state";

function stateCookie(req, value, maxAgeSec) {
  return serializeCookie(STATE_COOKIE, value, {
    httpOnly: true,
    path: "/api",
    sameSite: "Lax",
    maxAge: maxAgeSec,
    secure: isSecureRequest(req),
  });
}

/** Sets the state cookie for `provider` on `res`. */
export function issueLinkState(req, res, userId, provider) {
  const token = signState(stateKey(process.env.API_KEY_SEED), {
    userId, provider, nonce: randomBytes(16).toString("base64url"),
  });
  res.setHeader("Set-Cookie", stateCookie(req, token, Math.floor(STATE_TTL_MS / 1000)));
}

/** "ok" when the cookie's state is valid for this user and provider and unspent; else the reason. */
export async function consumeLinkState(req, userId, provider) {
  const token = parseCookies(req)[STATE_COOKIE];
  if (!token) return "missing";
  const verdict = verifyState(stateKey(process.env.API_KEY_SEED), token, { userId, provider });
  if (!verdict.ok) return verdict.reason;
  return (await spendStateNonce(verdict.nonce)) ? "ok" : "replayed";
}

/** The origin this request came in on ("https://etanagora.vercel.app"). */
export function requestOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${isSecureRequest(req) ? "https" : "http"}://${host}`;
}

/** Ends a callback: clears the state cookie and goes back to "Conexões" with a result code. */
export function finishLink(req, res, provider, result) {
  res.setHeader("Set-Cookie", stateCookie(req, "", 0));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.statusCode = 302;
  res.setHeader("Location", `/app.html?conn=${encodeURIComponent(provider)}&result=${encodeURIComponent(result)}`);
  res.end();
}
