import { afterEach, beforeEach, vi } from "vitest";
import { fakeFetch } from "./fakes/network";
import { emails } from "./fakes/email";
import { turnstile } from "./fakes/turnstile";

/**
 * Runs first in every test file. Settings get dummy values, none of them a real credential
 * (vitest.config.mts reads only the database settings from .env.local). A test that needs a
 * different value uses `vi.stubEnv`, which is undone after each test.
 */
Object.assign(process.env, {
  ADMIN_EMAILS: "admin@example.com",
  BREVO_API_KEY: "test-brevo-key",
  BREVO_FROM_EMAIL: "noreply@example.org",
  EMAIL_HASH_SECRET: "test-email-hash-secret",
  NEXT_PUBLIC_SITE_URL: "https://lawforaisafety.test",
  // Read when the widget module loads, so it is set before any test imports it.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-turnstile-site-key",
  SESSION_SECRET: "test-session-secret-at-least-32-characters",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
});
delete process.env.DEPLOY_CONTEXT;
// Only `*.db.test.*` files get a database (test/setup-db.ts sets this for them). Anywhere
// else the app's pool points at a host that cannot resolve, so a stray query fails visibly.
process.env.DATABASE_URL = "postgres://no-database-in-unit-tests.invalid:5432/none";
delete process.env.NETLIFY_DB_URL;

// The outside world is faked at `fetch`; see test/fakes/network.ts.
globalThis.fetch = fakeFetch as typeof fetch;

beforeEach(() => {
  emails.reset();
  turnstile.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
