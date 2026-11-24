/**
 * /api/preview — the preview card of one link in a message.
 *
 *   GET ?url=<http(s) URL>   { ok: true, preview: { url, siteName, title, description, image, provider } | null }
 *
 * Results are cached in Redis (ngr:lp:<sha256(url)>): 24 h, failures 1 h, so
 * each URL is fetched at most once a day whoever views it. Only a cache miss
 * counts toward the 30/min per-account limit. Messages are never changed:
 * previews are computed on display. Every rule is in lib/linkpreview.js and
 * lib/previewfetch.js.
 */
import { requireClientToken } from "../../lib/auth.js";
import { LIMITS, MESSAGES, hitWindow, tooManyRequests } from "../../lib/ratelimit.js";
import { normalizePreviewUrl } from "../../lib/linkpreview.js";
import { readCachedPreview, writeCachedPreview, computePreview } from "../../lib/previewfetch.js";

async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
    if (!req.account.user_id) return res.status(400).json({ ok: false, error: "Account is not initialized" });

    const url = normalizePreviewUrl(typeof req.query?.url === "string" ? req.query.url : "");
    if (!url) return res.status(400).json({ ok: false, error: "Invalid URL" });

    const cached = await readCachedPreview(url);
    if (cached.hit) return res.status(200).json({ ok: true, preview: cached.preview });

    const verdict = await hitWindow(LIMITS.linkPreview, req.account.user_id);
    if (!verdict.allowed) return tooManyRequests(res, verdict, MESSAGES.linkPreview);

    const { preview, ttl } = await computePreview(url);
    await writeCachedPreview(url, preview, ttl);
    res.status(200).json({ ok: true, preview });
  } catch (err) {
    console.error("[api/preview]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export default requireClientToken(handler);
