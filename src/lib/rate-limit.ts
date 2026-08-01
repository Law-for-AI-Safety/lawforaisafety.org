/**
 * In-memory sliding-window rate limiter, keyed by IP + bucket name.
 *
 * Netlify's own code-based rate limiting (the `config` export) only applies to
 * native Netlify Functions / Edge Functions, not Next.js Route Handlers run
 * via @netlify/plugin-nextjs — so this app-level limiter is the mechanism for
 * these routes. Caveat: state is per function instance, so it resets on cold
 * start and doesn't share state across concurrent instances. That's within
 * the spec's own bar ("generous enough not to block a real user, enough to
 * blunt a scripted flood") — not a hard guarantee. A netlify.toml redirect
 * rate_limit rule can be layered on top later for a stronger guarantee if needed.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { allowed: boolean } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
