export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET")    { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    // Use the server-side IP
    const ip =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      null;

    if (!ip) {
      res.status(200).json({ error: "Could not determine IP" });
      return;
    }

    const r    = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "nagora/1.0" },
      cache  : "no-store",
    });
    const data = await r.json();

    // Strip any error responses from ipapi.co
    if (data.error) {
      res.status(200).json({ error: data.reason || "ipapi error", ip });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("[api/geo]", err);
    res.status(500).json({ error: err.message });
  }
}
