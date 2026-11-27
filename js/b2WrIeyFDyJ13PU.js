// Classic script (no import/export) so scripts/smoke.test.mjs can load it in Node.
(function (root) {
  "use strict";

  const MAX_INPUT_BYTES = 15 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 1024 * 1024; // = lib/images.js MAX_IMAGE_BYTES
  const MAX_SIDE = 1600;
  const AVATAR_SIDE = 512; // the server makes the final 128 x 128
  const QUALITY_STEPS = [0.82, 0.72, 0.6];
  const MIN_CROP = 32;

  const CROP_PRESETS = [
    { id: "free", aspect: null },
    { id: "1:1", aspect: 1 },
    { id: "4:3", aspect: 4 / 3 },
    { id: "16:9", aspect: 16 / 9 },
  ];

  function fitWithin(width, height, max) {
    const scale = Math.min(1, max / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  function inputProblem(file) {
    if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) return "type";
    if (!(file.size > 0) || file.size > MAX_INPUT_BYTES) return "size";
    return null;
  }

  function outputProblem(byteLength) {
    return byteLength > 0 && byteLength <= MAX_OUTPUT_BYTES ? null : "size";
  }

  function skipSubBlocks(b, p) {
    while (p < b.length) {
      const n = b[p++];
      if (n === 0) break;
      p += n;
    }
    return p;
  }

  function gifFrameCount(b, stopAt = 2) {
    if (!b || b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return 0;
    let p = 13;
    if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1)); // global color table
    let frames = 0;
    while (p < b.length) {
      const type = b[p++];
      if (type === 0x3b) break;                      // trailer
      if (type === 0x21) {                           // extension
        p = skipSubBlocks(b, p + 1);
      } else if (type === 0x2c) {                    // image descriptor
        frames++;
        if (frames >= stopAt) return frames;
        if (p + 9 > b.length) break;
        const flags = b[p + 8];
        p += 9;
        if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1)); // local color table
        p = skipSubBlocks(b, p + 1);
      } else {
        break;
      }
    }
    return frames;
  }

  function bypassesProcessing(type, frameCount) {
    return type === "image/gif" && frameCount > 1;
  }

  function initialCrop(aspect, W, H) {
    if (!aspect) return { x: 0, y: 0, w: W, h: H };
    let w = W;
    let h = w / aspect;
    if (h > H) {
      h = H;
      w = h * aspect;
    }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function moveCrop(rect, dx, dy, W, H) {
    return {
      x: clamp(rect.x + dx, 0, W - rect.w),
      y: clamp(rect.y + dy, 0, H - rect.h),
      w: rect.w,
      h: rect.h,
    };
  }

  /** Dragging `corner` ("nw" | "ne" | "sw" | "se"): the opposite corner stays put. */
  function resizeCrop(rect, corner, dx, dy, aspect, W, H, min = MIN_CROP) {
    const west = corner.includes("w");
    const north = corner.includes("n");
    const ax = west ? rect.x + rect.w : rect.x;
    const ay = north ? rect.y + rect.h : rect.y;
    const maxW = west ? ax : W - ax;
    const maxH = north ? ay : H - ay;
    let w = west ? ax - (rect.x + dx) : rect.x + rect.w + dx - ax;
    let h = north ? ay - (rect.y + dy) : rect.y + rect.h + dy - ay;
    w = clamp(w, Math.min(min, maxW), maxW);
    h = clamp(h, Math.min(min, maxH), maxH);
    if (aspect) {
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
      const limit = Math.min(maxW, maxH * aspect);
      w = clamp(w, Math.min(Math.max(min, min * aspect), limit), limit);
      h = w / aspect;
    }
    return { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
  }

  function roundCrop(rect, W, H) {
    const x = clamp(Math.round(rect.x), 0, W - 1);
    const y = clamp(Math.round(rect.y), 0, H - 1);
    return {
      x,
      y,
      w: clamp(Math.round(rect.w), 1, W - x),
      h: clamp(Math.round(rect.h), 1, H - y),
    };
  }

  function kilobytes(byteLength) {
    return Math.max(1, Math.round(byteLength / 1024));
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch {
        // Fall back to <img>, which also applies EXIF orientation.
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let webpEncodeSupported = null;

  function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  /** WebP when the browser can encode it, else JPEG. Throws Error("too-large"). */
  async function encodeImage(decoded, crop, maxSide) {
    const area = roundCrop(crop || { x: 0, y: 0, w: decoded.width, h: decoded.height }, decoded.width, decoded.height);
    const { width, height } = fitWithin(area.w, area.h, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    for (const quality of QUALITY_STEPS) {
      const type = webpEncodeSupported === false ? "image/jpeg" : "image/webp";
      ctx.clearRect(0, 0, width, height);
      if (type === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(decoded.source, area.x, area.y, area.w, area.h, 0, 0, width, height);
      let blob = await canvasToBlob(canvas, type, quality);
      if (type === "image/webp") {
        webpEncodeSupported = !!blob && blob.type === "image/webp";
        if (!webpEncodeSupported) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(decoded.source, area.x, area.y, area.w, area.h, 0, 0, width, height);
          blob = await canvasToBlob(canvas, "image/jpeg", quality);
        }
      }
      if (!blob) throw new Error("encode-failed");
      if (!outputProblem(blob.size)) return { blob, width, height };
    }
    throw new Error("too-large");
  }

  async function isAnimatedGif(file) {
    if (file.type !== "image/gif") return false;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return gifFrameCount(bytes) > 1;
  }

  root.NagoraImage = {
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    MAX_SIDE,
    AVATAR_SIDE,
    QUALITY_STEPS,
    MIN_CROP,
    CROP_PRESETS,
    fitWithin,
    inputProblem,
    outputProblem,
    gifFrameCount,
    bypassesProcessing,
    initialCrop,
    moveCrop,
    resizeCrop,
    roundCrop,
    kilobytes,
    decodeImage,
    encodeImage,
    isAnimatedGif,
  };
})(globalThis);
