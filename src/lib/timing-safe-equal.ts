import { timingSafeEqual } from "node:crypto";

/** Constant-time string equality, so comparing a secret never leaks its length or a matching prefix via timing. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * True when `request` carries `Authorization: Bearer <secret>`, matched in constant time.
 * Always false with no secret, so an unset env var fails closed rather than open.
 */
export function hasBearerSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const provided = request.headers.get("authorization") ?? "";
  return timingSafeEqualStrings(provided, `Bearer ${secret}`);
}
