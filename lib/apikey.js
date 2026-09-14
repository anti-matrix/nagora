import { randomBytes } from "node:crypto";

export function generateApiKey() {
  return "ngr-" + randomBytes(32).toString("base64url");
}
