import { createHash } from "node:crypto";

/** What `admin_sessions` stores in place of the token the browser holds. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
