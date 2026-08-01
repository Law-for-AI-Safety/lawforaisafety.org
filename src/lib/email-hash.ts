import { createHmac } from "node:crypto";

export function hashEmail(email: string): string {
  const secret = process.env.EMAIL_HASH_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: EMAIL_HASH_SECRET");
  }
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex");
}
