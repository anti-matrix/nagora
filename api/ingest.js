import { kv, userKey, USERIDS } from "../lib/redis.js";

function clientIp(req) {
  return (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    "unknown"
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed" }); return; }

  const isUpdate = String(req.query?.update || "") === "1";

  try {
    const { user } = req.body;

    if (!user || typeof user !== "object") {
      res.status(400).json({ error: "Invalid payload: missing 'user' object" });
      return;
    }

    user.serverSideIp     = clientIp(req);
    user.serverReceivedAt = new Date().toISOString();
    user.userAgent        = req.headers["user-agent"] || null;

    const key      = userKey(user.userId);
    const existing = await kv.get(key);
    let visitCount;

    if (existing) {
      if (isUpdate) {
        visitCount = existing.visitCount || 1;
      } else {
        visitCount = (existing.visitCount || 1) + 1;
      }
      await kv.set(key, {
        ...user,
        firstSeenAt: existing.firstSeenAt || existing.visitedAt,
        visitCount,
      });
    } else {
      user.firstSeenAt = user.visitedAt;
      user.visitCount  = 1;
      visitCount       = 1;
      await kv.set(key, user);
      // Keep a set of all userIds for easy enumeration
      if (!isUpdate) {
        await kv.sadd(USERIDS, user.userId);
      }
    }

    res.status(200).json({ status: "ok", userId: user.userId, visits: visitCount });
  } catch (err) {
    console.error("[api/ingest]", err);
    res.status(500).json({ error: err.message });
  }
}
