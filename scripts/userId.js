(async function NAGORA_USER() {
  function getCookieValue(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
    return match ? match[1] : null;
  }

  function getUserCookie() {
    return getCookieValue("userId");
  }

  function setUserCookie(id) {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `userId=${id}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36).toUpperCase();
  }

  function buildUserId(ip, city) {
    const safeCity = (city || "unknown").toLowerCase().replace(/\s+/g, "");
    const timeTail = String(Date.now()).slice(-3);

    let ipSeed;
    if (ip && ip.includes(":")) {
      const stripped = ip.replace(/:/g, "");
      ipSeed = stripped.slice(0, 3) + stripped.slice(-2);
    } else {
      const stripped = (ip || "0.0.0.0").replace(/[^0-9.]/g, "");
      ipSeed = stripped.slice(0, 3) + stripped.slice(-2);
    }

    const seed   = ipSeed + safeCity + timeTail;
    const hash   = fnv1a(seed).padStart(7, "0");
    const chars  = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const suffix = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return hash + suffix;
  }

  async function safe(fn) {
    try { return await fn(); } catch { return null; }
  }

  async function ipGeo() {
    return safe(async () => {
      const r = await fetch("/api/geo", { cache: "no-store" });
      return await r.json();
    });
  }

  const ipGeoData = await ipGeo();

  let userId = getUserCookie();
  if (!userId) {
    userId = buildUserId(ipGeoData?.ip, ipGeoData?.city);
    setUserCookie(userId);
  }

  const payload = {
    userId,
    visitedAt: new Date().toISOString(),
    page: {
      url: location.href,
      title: document.title,
    },
    identity: {
      ip: ipGeoData?.ip || null,
      city: ipGeoData?.city || null,
    },
  };

  fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: payload }),
  })
    .then(r => r.json())
    .then(ok => console.log("[NAGORA_USER] logged:", userId, ok))
    .catch(e => console.warn("[NAGORA_USER] failed to send log:", e));
})();
