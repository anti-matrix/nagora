/**
 * lib/background.js — run work after the response without leaving a bare promise.
 *
 * The Vercel Node runtime publishes the request context on
 * globalThis[Symbol.for("@vercel/request-context")]; its waitUntil(promise)
 * keeps the invocation alive (up to maxDuration) until the promise settles.
 * The official @vercel/functions `waitUntil` is exactly this lookup, but it
 * does NOTHING, and says nothing, when the context is missing. Reading the
 * context here lets the caller fall back to awaiting instead.
 */

/** Vercel's waitUntil for the current invocation, or null when there is none. */
export function backgroundRunner() {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
    return typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : null;
  } catch {
    return null;
  }
}

/**
 * Registers `work` (a promise that never rejects) with waitUntil, or awaits it
 * when there is no request context. Resolves to "waitUntil" or "awaited".
 */
export async function runAfterResponse(work) {
  const run = backgroundRunner();
  if (run) {
    run(work);
    return "waitUntil";
  }
  await work;
  return "awaited";
}
