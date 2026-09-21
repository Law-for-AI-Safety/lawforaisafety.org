/**
 * Which Netlify deploy context this code was *built* for: "production",
 * "deploy-preview", "branch-deploy", or "" off Netlify (local dev, scripts).
 *
 * Netlify's own `CONTEXT` variable exists only during the build. At function
 * runtime `process.env.CONTEXT` is undefined — so code that read it there
 * concluded, in production, that it was not in production: real applicants
 * were never emailed, and non-production behaviour (logging confirmation
 * links, trusting x-forwarded-for) switched on. `DEPLOY_CONTEXT` is `CONTEXT`
 * captured at build time and inlined by Next (see `env` in next.config.ts),
 * so it has the same value at build, at runtime, on server and client.
 *
 * Anything that must only happen in production, or must never happen there,
 * goes through these helpers — never `process.env.CONTEXT` directly.
 */
export function deployContext(): string {
  return process.env.DEPLOY_CONTEXT ?? "";
}

export function isProductionDeploy(): boolean {
  return deployContext() === "production";
}

export function isNetlifyDeploy(): boolean {
  return deployContext() !== "";
}
