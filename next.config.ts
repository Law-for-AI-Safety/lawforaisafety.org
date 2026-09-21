import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No nonces: they'd force every page to render dynamically, and the public
// pages are static. 'unsafe-inline' for scripts is the cost of that (Next's
// own inline bootstrap + the JSON-LD blocks need it) — what this policy still
// buys is that script can only *load* from us or Turnstile, the page can't be
// framed, forms can only post to us (or on, via redirect, to the two OAuth
// providers), and nothing can be embedded as a plugin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // OAuth profile pictures on the admin review page come from the providers' CDNs.
  "img-src 'self' data: blob: https://*.licdn.com https://*.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  // pdf.js renders CVs in a worker on the admin review page.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  // Browsers apply form-action to the redirect chain too: the apply form
  // posts to us and is then redirected to the provider's sign-in page.
  "form-action 'self' https://www.linkedin.com https://accounts.google.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // No `preload` yet — that's a one-way door (see dns-hardening-steps.md).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
