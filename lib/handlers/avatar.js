import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import sharp from "sharp";

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

async function postAvatar(req, res) {
  const { imageBase64 } = req.body || {};

  if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return res.status(400).json({ error: "Image file is required" });
  }

  const buffer = Buffer.from(imageBase64.trim(), "base64");
  if (!buffer.length) {
    return res.status(400).json({ error: "Invalid image file" });
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    return res.status(400).json({ error: "Image file is too large" });
  }

  let compressed;
  try {
    compressed = await sharp(buffer)
      .rotate()
      .resize(128, 128, { fit: "cover", withoutEnlargement: false })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
  } catch (err) {
    console.error("[api/avatar] sharp error", err);
    return res.status(400).json({ error: "Invalid image file" });
  }

  await query(
    "UPDATE accounts SET avatar_bytes = $1, avatar_type = $2 WHERE user_id = $3",
    [compressed, "image/webp", req.account.user_id]
  );

  res.status(200).json({ ok: true });
}

async function getAvatar(req, res) {
  const userId = req.query?.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing user id" });
  }

  const { rows } = await query(
    "SELECT avatar_bytes, avatar_type FROM accounts WHERE user_id = $1",
    [userId]
  );

  if (!rows.length || !rows[0].avatar_bytes) {
    return res.status(404).json({ error: "Avatar not found" });
  }

  res.setHeader("Content-Type", rows[0].avatar_type || "image/webp");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.status(200).send(rows[0].avatar_bytes);
}

async function handler(req, res) {
  if (req.method === "POST") return postAvatar(req, res);
  if (req.method === "GET") return getAvatar(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

export default requireClientToken(handler);
