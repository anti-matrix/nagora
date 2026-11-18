import { requireClientToken } from "../../lib/auth.js";
import { query } from "../../lib/db.js";
import { decodeImageBase64, processAvatarImage, ImageInputError } from "../../lib/images.js";

async function postAvatar(req, res) {
  // Re-encoded to a 128 x 128 WebP with no metadata (lib/images.js).
  let compressed;
  try {
    compressed = await processAvatarImage(decodeImageBase64(req.body?.imageBase64));
  } catch (err) {
    if (err instanceof ImageInputError) return res.status(400).json({ error: err.message });
    throw err;
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
