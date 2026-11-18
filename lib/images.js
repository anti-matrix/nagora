/**
 * lib/images.js — the one server-side image rule, shared by DM images, room
 * images and avatars.
 *
 * Whatever the client sent, every image is decoded and re-encoded with sharp
 * to WebP, which drops all metadata (EXIF, GPS, ICC, XMP). The client's MIME
 * type is never used: the format sharp reads from the bytes must be in
 * ALLOWED_IMAGE_FORMATS (no SVG, no HEIC, no TIFF...).
 */
import sharp from "sharp";

/** Largest image upload accepted, in decoded bytes (the client compresses to fit). */
export const MAX_IMAGE_BYTES = 1024 * 1024;
/** Re-encoded output above this is refused (a tiny-palette GIF can grow as lossy WebP). */
export const MAX_STORED_IMAGE_BYTES = 2 * MAX_IMAGE_BYTES;
export const MAX_IMAGE_SIDE = 1600;
export const AVATAR_SIDE = 128;
export const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "webp", "gif"];
// Decompression-bomb guard: a small PNG can expand to gigabytes of pixels.
// Client output is at most 1600 x 1600; this leaves generous headroom.
const MAX_INPUT_PIXELS = 40_000_000;

export class ImageInputError extends Error {}

/** null when the upload size is acceptable, else the English error sentence. */
export function imageSizeProblem(byteLength) {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return "Invalid image file";
  if (byteLength > MAX_IMAGE_BYTES) return "Image file is too large";
  return null;
}

export function isAllowedImageFormat(format) {
  return ALLOWED_IMAGE_FORMATS.includes(format);
}

/** Base64 from a JSON body -> Buffer. Throws ImageInputError on missing / empty / oversized input. */
export function decodeImageBase64(imageBase64) {
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) throw new ImageInputError("Image file is required");
  // Reject before decoding when the base64 alone is already too long.
  if (imageBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 8) throw new ImageInputError("Image file is too large");
  const buffer = Buffer.from(imageBase64.trim(), "base64");
  const problem = imageSizeProblem(buffer.length);
  if (problem) throw new ImageInputError(problem);
  return buffer;
}

async function readFormat(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ImageInputError("Invalid image file");
  }
  if (!isAllowedImageFormat(meta.format)) throw new ImageInputError("Unsupported image format");
  return meta;
}

/**
 * Message image (DM or room): fit inside 1600 px, WebP, no metadata.
 * Animated GIF / WebP stay animated. Returns { bytes, mediaType, width, height }.
 */
export async function processMessageImage(buffer) {
  const meta = await readFormat(buffer);
  const animated = (meta.pages || 1) > 1;
  let out;
  try {
    out = await sharp(buffer, { animated, limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    console.error("[lib/images] sharp error", err?.message || err);
    throw new ImageInputError("Invalid image file");
  }
  if (out.data.length > MAX_STORED_IMAGE_BYTES) throw new ImageInputError("Image file is too large");
  return {
    bytes: out.data,
    mediaType: "image/webp",
    width: out.info.width,
    // For animations info.height is the whole frame strip.
    height: out.info.pageHeight || out.info.height,
  };
}

/** Avatar: 128 x 128 cover crop, WebP, no metadata, first frame only. */
export async function processAvatarImage(buffer) {
  await readFormat(buffer);
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(AVATAR_SIDE, AVATAR_SIDE, { fit: "cover", withoutEnlargement: false })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
  } catch (err) {
    console.error("[lib/images] avatar sharp error", err?.message || err);
    throw new ImageInputError("Invalid image file");
  }
}
