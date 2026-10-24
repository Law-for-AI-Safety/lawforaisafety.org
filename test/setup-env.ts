import { afterEach, beforeEach, vi } from "vitest";
import { fakeFetch, routeOrigin } from "./fakes/network";
import { github, GITHUB_API } from "./fakes/github";
import { emails } from "./fakes/email";
import { turnstile } from "./fakes/turnstile";
import { dataCache } from "./next-cache";

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
// Publishing is not set up unless a test points it at the fake GitHub (`githubEnv()`).
for (const name of ["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_REPO_OWNER", "GITHUB_REPO_NAME", "GITHUB_API_URL", "CMS_PREVIEW_SITE_NAME"]) {
  delete process.env[name];
}
// Only `*.db.test.*` files get a database (test/setup-db.ts sets this for them). Anywhere
// else the app's pool points at a host that cannot resolve, so a stray query fails visibly.
process.env.DATABASE_URL = "postgres://no-database-in-unit-tests.invalid:5432/none";
delete process.env.NETLIFY_DB_URL;

vi.mock("next/cache", () => import("./next-cache"));
// `connection()` needs Next's request scope; a test always runs at "request time".
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// The outside world is faked at `fetch`; see test/fakes/network.ts.
globalThis.fetch = fakeFetch as typeof fetch;
routeOrigin(GITHUB_API, (request) => github.handle(request));

beforeEach(() => {
  dataCache.reset();
  emails.reset();
  turnstile.reset();
  github.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
