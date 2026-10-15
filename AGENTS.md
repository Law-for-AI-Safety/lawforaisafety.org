<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Testing

`npm run check-all` runs typecheck, lint and every test with coverage; run it before raising a PR. CI runs the same on every PR and push to `main`, against a Postgres service container.

- `npm test` runs every test once, `npm run test:watch` reruns on change, and `npm run test:coverage` adds coverage (listing uncovered lines when only coverage fails).
- Vitest has two projects: `*.test.ts` runs in node, `*.test.tsx` in jsdom. A file named `*.db.test.ts(x)` uses the real database: each test file gets its own Postgres database, cloned from a template migrated with `netlify/database/migrations/` (`test/pg.ts`). The app's own `src/lib/db.ts` pool talks to it; never mock the database.
- The tests need Postgres from `npm run db:up`, or `TEST_DATABASE_URL`. Without one, `npm run test:no-db` leaves out the `*.db.test.*` files. CI never does.
- Comments describe the code as it stands, never the edit, and hold no measured numbers.

### Fakes and seams

Only the outside world is faked, and only at a seam. The app reaches Turnstile, Brevo and Slack through `fetch`, so `test/setup-env.ts` replaces it: a request to the app's own origin runs the real route handler (`test/app-fetch.ts`), a request to a service goes to its fake in `test/fakes/`, and any other request throws.

- Fakes have named helpers so a test's intent is visible: `turnstile.solve()`, `turnstile.failNext()`, `emails.to(address)`, `emails.failNext()`. The harness resets them before each test.
- Assert on what would have reached the outside world: the email's recipient and body, the request Turnstile was sent.
- Never `vi.mock` our own modules. If code under `src/` needs faking, give it a seam (a parameter or setter with a production default) and add a fake in `test/fakes/`. `vi.mock` is only for framework edges such as `next/navigation` (`test/setup-dom.ts`).
- Fake the clock with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime`; set settings with `vi.stubEnv`. Both are undone after each test.

### Coverage

`src/cms/**` must have 100% line and statement coverage. Everything else under `src/` has a floor in `vitest.config.mts`: raise it as tests are added, never lower it.

- Never use `/* v8 ignore */`, `/* istanbul ignore */` or any other coverage-exclusion comment.
- Don't remove a defensive guard, or replace it with a `!` assertion, to make a line unreachable. Reach it with a test, or narrow the type at the call site. If a line truly cannot run, say so in the PR.

### Flaky tests

A test that fails once and passes on rerun is a bug to fix now, not noise. Rerun that test file 8 times, find the race, fix it, then rerun it 8 times again until every run passes.
