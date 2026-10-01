(async function NAGORA_USER() {
  let currentPayload = null;

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

  const MAX_ACTIVITIES = 10;
  const ACTIVITY_UPDATE_MS = 5000;
  const activityBuffer = [];
  const rawCooldowns = new Map();
  let lastActivityAt = Date.now();
  let lastActivitySentAt = 0;

  function pushRawActivity(type) {
    const now = Date.now();
    lastActivityAt = now;
    const last = rawCooldowns.get(type);
    if (last && now - last < 1000) return;
    rawCooldowns.set(type, now);
    activityBuffer.push({ type, at: now });
    if (activityBuffer.length > MAX_ACTIVITIES) activityBuffer.shift();
  }

  function trackActivity(type) {
    const now = Date.now();
    lastActivityAt = now;
    activityBuffer.push({ type, at: now });
    if (activityBuffer.length > MAX_ACTIVITIES) activityBuffer.shift();
  }

  window.__NAGORA_ACTIVITY__ = {
    track: trackActivity,
    get lastActivityAt() { return lastActivityAt; },
    get activities() { return activityBuffer.slice(); },
  };

  for (const type of ["mousemove", "keydown", "mousedown", "click", "touchstart", "scroll"]) {
    window.addEventListener(type, () => pushRawActivity(type), true);
  }

  async function sendActivityUpdate() {
    if (!currentPayload) return;
    if (lastActivityAt <= lastActivitySentAt) return;
    lastActivitySentAt = lastActivityAt;

    const updatePayload = {
      ...currentPayload,
      page: {
        ...currentPayload.page,
        url: location.href,
        activities: activityBuffer.slice(),
      },
      lastActivityAt,
    };

    await safe(async () => {
      const r = await fetch("/api/ingest?update=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: updatePayload }),
      });
      const ok = await r.json();
      console.log("[NAGORA_USER]: Activity update. userId:", updatePayload.userId, ok);
    });
  }

  async function getClientHints() {
    return safe(async () => {
      if (
        !navigator.userAgentData ||
        typeof navigator.userAgentData.getHighEntropyValues !== "function"
      ) {
        return null;
      }
      return await navigator.userAgentData.getHighEntropyValues([
        "architecture",
        "model",
        "platform",
        "platformVersion",
        "bitness",
        "fullVersionList",
      ]);
    });
  }

  async function collectPerformanceMetrics() {
    return safe(async () => {
      const memory = performance.memory
        ? {
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          }
        : null;

      const navEntry = performance.getEntriesByType("navigation")[0];
      const timing = navEntry
        ? {
            dns: navEntry.domainLookupEnd - navEntry.domainLookupStart,
            tcp: navEntry.connectEnd - navEntry.connectStart,
            ttfb: navEntry.responseStart - navEntry.requestStart,
            domLoad: navEntry.domContentLoadedEventEnd - navEntry.startTime,
          }
        : null;

      return { memory, timing };
    });
  }

  async function measureRefreshRate() {
    return safe(async () => {
      return new Promise(resolve => {
        const samples = [];
        const start = performance.now();
        const maxFrames = 120;
        const budgetMs = 1100;
        let rafId = null;
        let timeoutId = null;

        const settle = value => {
          if (timeoutId) clearTimeout(timeoutId);
          cancelAnimationFrame(rafId);
          resolve(value);
        };

        const loop = now => {
          samples.push(now);
          if (samples.length >= maxFrames || now - start >= budgetMs) {
            if (samples.length < 10) return settle(null);

            const deltas = [];
            for (let i = 1; i < samples.length; i++) deltas.push(samples[i] - samples[i - 1]);
            deltas.sort((a, b) => a - b);

            const medianDelta = deltas[Math.floor(deltas.length / 2)];
            const minDelta = deltas[0];

            return settle({
              medianHz       : medianDelta > 0 ? Math.round(1000 / medianDelta) : null,
              minHz          : minDelta > 0 ? Math.round(1000 / minDelta) : null,
              sampleCount    : samples.length,
              medianDeltaMs  : medianDelta,
              minDeltaMs     : minDelta,
            });
          }
          rafId = requestAnimationFrame(loop);
        };

        timeoutId = setTimeout(() => settle(null), 1500);
        rafId = requestAnimationFrame(loop);
      });
    });
  }

  function getCSSMediaFeatures() {
    try {
      const mq = q => window.matchMedia(q).matches;
      return {
        colorScheme  : mq("(prefers-color-scheme: dark)") ? "dark" : "light",
        reducedMotion: mq("(prefers-reduced-motion: reduce)"),
        highContrast : mq("(prefers-contrast: more)"),
        reducedData  : mq("(prefers-reduced-data: reduce)"),
        hdr          : mq("(dynamic-range: high)"),
        colorGamut   : mq("(color-gamut: p3)") ? "p3" : "srgb",
      };
    } catch { return null; }
  }

  function getExtendedCssMediaFeatures() {
    try {
      const mq = q => window.matchMedia(q).matches;
      const hoverNone = mq("(hover: none)");
      return {
        pointer       : mq("(pointer: fine)") ? "fine" : mq("(pointer: coarse)") ? "coarse" : "none",
        hover         : hoverNone ? "none" : "hover",
        anyPointer    : mq("(any-pointer: fine)") ? "fine" : mq("(any-pointer: coarse)") ? "coarse" : "none",
        anyHover      : mq("(any-hover: hover)") ? "hover" : "none",
        prefersContrast: mq("(prefers-contrast: more)") ? "more" : mq("(prefers-contrast: less)") ? "less" : mq("(prefers-contrast: custom)") ? "custom" : "no-preference",
        forcedColors  : mq("(forced-colors: active)"),
        invertedColors: mq("(inverted-colors: inverted)"),
      };
    } catch { return null; }
  }

  function getSensorApis() {
    try {
      return {
        hasMotion: "DeviceMotionEvent" in window,
        hasOrientation: "DeviceOrientationEvent" in window,
        hasAbsoluteOrientation: "DeviceOrientationAbsolute" in window,
      };
    } catch { return null; }
  }

  function canvasFingerprint() {
    try {
      const c = document.createElement("canvas");
      c.width = 200; c.height = 50;
      const ctx = c.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("user🔍", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("user🔍", 4, 17);
      return fnv1a(c.toDataURL());
    } catch { return null; }
  }

  function webglFingerprint() {
    try {
      const c   = document.createElement("canvas");
      const gl  = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return null;

      const dbg = gl.getExtension("WEBGL_debug_renderer_info");

      const getParam = p => {
        try { return gl.getParameter(p); } catch { return null; }
      };

      let webgl2Anisotropy = null;
      const gl2 = c.getContext("webgl2");
      if (gl2) {
        const ext =
          gl2.getExtension("EXT_texture_filter_anisotropic") ||
          gl2.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
          gl2.getExtension("MOZ_EXT_texture_filter_anisotropic");
        if (ext) {
          const max = gl2.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          webgl2Anisotropy = typeof max === "number" ? max : null;
        }
      }

      return {
        vendor  : dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version : gl.getParameter(gl.VERSION),
        shading : gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        extensions: gl.getSupportedExtensions(),
        maxTextureSize: getParam(gl.MAX_TEXTURE_SIZE),
        maxVaryings: getParam(gl.MAX_VARYING_VECTORS),
        maxVertexAttribs: getParam(gl.MAX_VERTEX_ATTRIBS),
        maxFragmentUniformVectors: getParam(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        maxVertexUniformVectors: getParam(gl.MAX_VERTEX_UNIFORM_VECTORS),
        webgl2Anisotropy,
      };
    } catch { return null; }
  }

  async function audioFingerprint() {
    return safe(async () => {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const osc  = ctx.createOscillator();
      const ana  = ctx.createAnalyser();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(ana); ana.connect(gain); gain.connect(ctx.destination);
      osc.start(0);
      await new Promise(r => setTimeout(r, 100));
      const buf = new Float32Array(ana.frequencyBinCount);
      ana.getFloatFrequencyData(buf);
      osc.stop(); await ctx.close();
      return fnv1a(buf.slice(0, 30).join(","));
    });
  }

  function fontProbe() {
    try {
      const test  = "mmmmmmmmmmlli";
      const base  = "monospace";
      const fonts = [
        "Arial","Verdana","Helvetica","Times New Roman","Courier New",
        "Georgia","Palatino","Garamond","Bookman","Comic Sans MS",
        "Trebuchet MS","Arial Black","Impact","Lucida Sans Unicode",
        "Tahoma","Geneva","Lucida Console","Monaco","Courier",
        "Ubuntu","Roboto","Segoe UI","Calibri","Cambria","Consolas",
      ];
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d");
      if (!ctx) return [];
      ctx.font     = `72px ${base}`;
      const baseW  = ctx.measureText(test).width;
      return fonts.filter(f => {
        ctx.font = `72px '${f}',${base}`;
        return ctx.measureText(test).width !== baseW;
      });
    } catch { return []; }
  }

  async function mediaDevices() {
    return safe(async () => {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.map(d => ({ kind: d.kind, label: d.label || "(unlabeled)" }));
    });
  }

  async function batteryInfo() {
    return safe(async () => {
      const b = await navigator.getBattery();
      return { level: b.level, charging: b.charging, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime };
    });
  }

  async function storageInfo() {
    return safe(async () => {
      const est = await navigator.storage.estimate();
      return { quota: est.quota, usage: est.usage };
    });
  }

  async function ipGeo() {
    return safe(async () => {
      const r = await fetch("/api/geo", { cache: "no-store" });
      return await r.json();
    });
  }

  async function geoLocation() {
    return safe(() =>
      new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          pos => resolve({
            latitude : pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy : pos.coords.accuracy,
            altitude : pos.coords.altitude,
          }),
          () => resolve(null),
          { timeout: 5000 }
        );
      })
    );
  }

  function getLocaleInfo() {
    try {
      const dtf = Intl.DateTimeFormat().resolvedOptions();
      const nf = Intl.NumberFormat().resolvedOptions();
      return {
        language        : navigator.language || null,
        languages       : navigator.languages ? Array.from(navigator.languages) : null,
        timezone        : dtf.timeZone || null,
        calendar        : dtf.calendar || null,
        numberingSystem : dtf.numberingSystem || null,
        hourCycle       : dtf.hourCycle || null,
        region          : dtf.region || nf.locale?.split("-")[1] || null,
        keyboardApi     : !!(navigator.keyboard),
      };
    } catch { return null; }
  }

  function getVisualViewport() {
    try {
      const vv = window.visualViewport;
      if (!vv) return null;
      return {
        width  : vv.width,
        height : vv.height,
        scale  : vv.scale,
        offsetLeft: vv.offsetLeft,
        offsetTop : vv.offsetTop,
        pageLeft  : vv.pageLeft,
        pageTop   : vv.pageTop,
      };
    } catch { return null; }
  }

  function getTouchPointerDetails() {
    try {
      return {
        maxTouchPoints: navigator.maxTouchPoints,
        ontouchstart  : "ontouchstart" in window,
        pointerEvent  : !!window.PointerEvent,
      };
    } catch { return null; }
  }

  function getGamepadInfo() {
    try {
      const supported = "getGamepads" in navigator;
      let connectedCount = 0;
      if (supported && typeof navigator.getGamepads === "function") {
        const pads = navigator.getGamepads();
        if (pads) {
          for (const pad of pads) {
            if (pad && pad.connected) connectedCount++;
          }
        }
      }
      return {
        supported     : supported,
        connectedCount: connectedCount,
      };
    } catch { return null; }
  }

  function getAdvancedApis() {
    try {
      return {
        worker           : typeof Worker !== "undefined",
        sharedWorker     : typeof SharedWorker !== "undefined",
        broadcastChannel : typeof BroadcastChannel !== "undefined",
        cryptoRandomUUID : !!(window.crypto && typeof crypto.randomUUID === "function"),
        cryptoSubtle     : !!(window.crypto && crypto.subtle),
        webgpu           : !!(navigator.gpu),
        webxr            : !!(navigator.xr),
        vibrate          : !!(navigator.vibrate),
        locks            : !!(navigator.locks),
        credentials      : !!(navigator.credentials),
      };
    } catch { return null; }
  }

  function computeStableFingerprint(canvasHash, webglObject, audioHash, fontsArray) {
    try {
      if (canvasHash == null || webglObject == null || audioHash == null || fontsArray == null) return null;
      const webglStable = JSON.stringify({
        vendor: webglObject.vendor,
        renderer: webglObject.renderer,
        version: webglObject.version,
        shading: webglObject.shading,
      });
      return fnv1a(JSON.stringify([canvasHash, webglStable, audioHash, fontsArray]));
    } catch { return null; }
  }

  const ipGeoData = await ipGeo();

  const cookieId = getUserCookie();
  const cookieHit = !!cookieId;
  const userId = cookieId || buildUserId(ipGeoData?.ip, ipGeoData?.city);

  if (!cookieId) {
    setUserCookie(userId);
  }

  const [audio, battery, storage, mediaDev, clientHints, performanceMetrics, refreshRate] = await Promise.all([
    audioFingerprint(), batteryInfo(), storageInfo(), mediaDevices(), getClientHints(), collectPerformanceMetrics(), measureRefreshRate(),
  ]);
  const geoPos = null;

  const windowNameState = (() => {
    try {
      const existing = window.name || "";
      if (!existing) {
        const token = "nagora_" + Date.now();
        window.name = token;
        return { token, length: token.length, preexisting: false };
      }
      return { token: existing, length: existing.length, preexisting: true };
    } catch { return { token: null, length: null, preexisting: null }; }
  })();

  const nav = navigator;
  const scr = screen;
  const con = nav.connection || nav.mozConnection || nav.webkitConnection || null;

  const canvasHash = canvasFingerprint();
  const webglObject = webglFingerprint();
  const audioHash = audio;
  const fontsArray = fontProbe();

  const payload = {
    userId,
    cookieHit,
    visitedAt : new Date().toISOString(),

    identity: {
      ip          : ipGeoData?.ip       || null,
      city        : ipGeoData?.city     || null,
      region      : ipGeoData?.region   || null,
      country     : ipGeoData?.country  || null,
      countryName : ipGeoData?.country_name || null,
      postal      : ipGeoData?.postal   || null,
      latitude    : ipGeoData?.latitude || null,
      longitude   : ipGeoData?.longitude|| null,
      org         : ipGeoData?.org      || null,
      asn         : ipGeoData?.asn      || null,
      timezone    : ipGeoData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },

    time: {
      utc           : new Date().toISOString(),
      local         : new Date().toString(),
      timezone      : Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
    },

    browser: {
      userAgent       : nav.userAgent,
      appName         : nav.appName,
      appVersion      : nav.appVersion,
      vendor          : nav.vendor,
      product         : nav.product,
      language        : nav.language,
      languages       : nav.languages,
      cookiesEnabled  : nav.cookieEnabled,
      doNotTrack      : nav.doNotTrack,
      javaEnabled     : typeof nav.javaEnabled === "function" ? nav.javaEnabled() : false,
      onLine          : nav.onLine,
      pdfViewerEnabled: nav.pdfViewerEnabled,
      clientHints     : clientHints,
      locale          : getLocaleInfo(),
    },

    page: {
      url       : location.href,
      origin    : location.origin,
      referrer  : document.referrer || null,
      title     : document.title,
      readyState: document.readyState,
      protocol  : location.protocol,
      host      : location.host,
      windowNameState: windowNameState,
    },

    display: {
      screen: {
        width           : scr.width,
        height          : scr.height,
        availWidth      : scr.availWidth,
        availHeight     : scr.availHeight,
        availLeft       : scr.availLeft,
        availTop        : scr.availTop,
        colorDepth      : scr.colorDepth,
        pixelDepth      : scr.pixelDepth,
        devicePixelRatio: window.devicePixelRatio,
        orientation     : scr.orientation ? { type: scr.orientation.type, angle: scr.orientation.angle } : null,
        refreshRate     : refreshRate,
      },
      viewport: {
        innerWidth : window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth : window.outerWidth,
        outerHeight: window.outerHeight,
        scrollX    : window.scrollX,
        scrollY    : window.scrollY,
        visualViewport: getVisualViewport(),
      },
      cssMedia: {
        ...getCSSMediaFeatures(),
        ...getExtendedCssMediaFeatures(),
      },
    },

    hardware: {
      platform       : nav.platform,
      deviceMemoryGB : nav.deviceMemory        || null,
      cpuCores       : nav.hardwareConcurrency || null,
      maxTouchPoints : nav.maxTouchPoints,
      touchSupport   : ("ontouchstart" in window) || navigator.maxTouchPoints > 0,
      touchDetails   : getTouchPointerDetails(),
      gamepads       : getGamepadInfo(),
      performanceMetrics: performanceMetrics,
      sensorApis     : getSensorApis(),
      battery        : battery,
    },

    network: con ? {
      effectiveType: con.effectiveType,
      downlinkMbps : con.downlink,
      rttMs        : con.rtt,
      saveData     : con.saveData,
      type         : con.type,
    } : null,

    software: {
      plugins     : Array.from(nav.plugins || []).map(p => ({ name: p.name, filename: p.filename, description: p.description })),
      mediaDevices: mediaDev,
      storage     : storage,
    },

    fingerprints: {
      canvas: canvasHash,
      webgl : webglObject,
      audio : audioHash,
      fonts : fontsArray,
      stable: computeStableFingerprint(canvasHash, webglObject, audioHash, fontsArray),
    },

    capabilities: {
      webWorkers       : typeof Worker !== "undefined",
      serviceWorkers   : "serviceWorker" in nav,
      sharedWorkers    : typeof SharedWorker !== "undefined",
      webAssembly      : typeof WebAssembly === "object",
      webRTC           : !!(window.RTCPeerConnection),
      indexedDB        : !!window.indexedDB,
      localStorage     : !!window.localStorage,
      sessionStorage   : !!window.sessionStorage,
      notifications    : "Notification" in window,
      geolocation      : "geolocation" in nav,
      bluetooth        : "bluetooth" in nav,
      usb              : "usb" in nav,
      clipboard        : "clipboard" in nav,
      pointerEvents    : !!window.PointerEvent,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      permissions      : "permissions" in nav,
      hid              : "hid" in nav,
      serial           : "serial" in nav,
      nfc              : "NFC" in nav,
      wakeLock         : "wakeLock" in nav,
      presentation     : "presentation" in nav,
      keyboard         : !!(nav.keyboard),
      ...getAdvancedApis(),
    },
  };

  currentPayload = payload;
  setInterval(sendActivityUpdate, ACTIVITY_UPDATE_MS);

  fetch("/api/ingest", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ user: payload }),
  })
  .then(r  => r.json())
  .then(ok => console.log("[NAGORA_USER]: Logged. userId:", payload.userId, ok))
  .catch(e => console.warn("[NAGORA_USER]: Failed to send log:", e));

})();
