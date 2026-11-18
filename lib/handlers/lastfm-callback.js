/**
 * /api/lastfm-callback — Last.fm web-auth callback (registered at exactly
 * https://etanagora.vercel.app/api/lastfm-callback; Last.fm appends ?token=).
 *
 * Session cookie + signed state cookie (lib/linkstate.js). Exchanges the token
 * through auth.getSession, keeps only the Last.fm username, drops the session
 * key. Always answers a redirect to the app ("Conexões" + result code).
 */
import { loadSessionAccount } from "../../lib/auth.js";
import { providerAvailable } from "../../lib/integrations.js";
import { lastfmSessionName, linkIntegration, AlreadyLinkedError, dropCachedActivity } from "../../lib/providers.js";
import { consumeLinkState, finishLink } from "../../lib/linkstate.js";

const PROVIDER = "lastfm";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
  try {
    const account = await loadSessionAccount(req);
    if (!account?.user_id) {
      res.statusCode = 302;
      res.setHeader("Location", "/index.html");
      res.end();
      return;
    }
    if (!providerAvailable(PROVIDER)) return finishLink(req, res, PROVIDER, "unavailable");

    const state = await consumeLinkState(req, account.user_id, PROVIDER);
    if (state !== "ok") {
      console.log(`[api/lastfm-callback] ${account.username}: state ${state}`);
      return finishLink(req, res, PROVIDER, state === "expired" || state === "missing" ? "expired" : "failed");
    }

    const token = typeof req.query?.token === "string" ? req.query.token : "";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return finishLink(req, res, PROVIDER, "denied");

    const name = await lastfmSessionName(token);
    try {
      await linkIntegration(account.user_id, PROVIDER, name, name);
    } catch (err) {
      if (err instanceof AlreadyLinkedError) return finishLink(req, res, PROVIDER, "taken");
      throw err;
    }
    await dropCachedActivity(PROVIDER, account.user_id, name);
    console.log(`[api/lastfm-callback] ${account.username} linked Last.fm ${name}`);
    finishLink(req, res, PROVIDER, "ok");
  } catch (err) {
    console.error("[api/lastfm-callback]", err?.message || err);
    if (!res.headersSent) finishLink(req, res, PROVIDER, "failed");
  }
}
