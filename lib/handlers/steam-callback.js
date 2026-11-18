/**
 * /api/steam-callback — "Sign in through Steam" (OpenID 2.0) return URL.
 *
 * Session cookie + signed state cookie (lib/linkstate.js). The assertion is
 * checked locally (mode, return_to, endpoint, claimed_id) and then confirmed
 * by Steam itself with check_authentication; only then is the SteamID64 kept.
 * Always answers a redirect to the app ("Conexões" + result code).
 */
import { loadSessionAccount } from "../../lib/auth.js";
import { providerAvailable, readSteamAssertion } from "../../lib/integrations.js";
import { steamAssertionValid, steamPlayer, linkIntegration, AlreadyLinkedError, dropCachedActivity } from "../../lib/providers.js";
import { consumeLinkState, finishLink, requestOrigin } from "../../lib/linkstate.js";

const PROVIDER = "steam";

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
      console.log(`[api/steam-callback] ${account.username}: state ${state}`);
      return finishLink(req, res, PROVIDER, state === "expired" || state === "missing" ? "expired" : "failed");
    }

    const assertion = readSteamAssertion(req.query, requestOrigin(req));
    if (assertion.error) return finishLink(req, res, PROVIDER, assertion.error);
    if (!(await steamAssertionValid(req.query))) {
      console.log(`[api/steam-callback] ${account.username}: assertion rejected by Steam`);
      return finishLink(req, res, PROVIDER, "failed");
    }

    // The persona name is only a label; linking works without it.
    let personaName = null;
    try {
      personaName = (await steamPlayer(assertion.steamId))?.personaName || null;
    } catch (err) {
      console.error("[api/steam-callback] persona lookup failed:", err?.message || err);
    }

    try {
      await linkIntegration(account.user_id, PROVIDER, assertion.steamId, personaName);
    } catch (err) {
      if (err instanceof AlreadyLinkedError) return finishLink(req, res, PROVIDER, "taken");
      throw err;
    }
    await dropCachedActivity(PROVIDER, account.user_id, assertion.steamId);
    console.log(`[api/steam-callback] ${account.username} linked a Steam account`);
    finishLink(req, res, PROVIDER, "ok");
  } catch (err) {
    console.error("[api/steam-callback]", err?.message || err);
    if (!res.headersSent) finishLink(req, res, PROVIDER, "failed");
  }
}
