export function parseCookies(req) {
  const raw = req.headers?.cookie;
  if (!raw) return {};

  const cookies = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function serializeCookie(name, value, opts = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.httpOnly) cookie += "; HttpOnly";
  if (opts.secure) cookie += "; Secure";
  return cookie;
}

export function isSecureRequest(req) {
  return req.headers?.["x-forwarded-proto"] === "https";
}
