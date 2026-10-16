<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Signing in to the dev server

To check a change in a browser as a particular admin, never use LinkedIn. `npm run dev:accounts` lets in four made-up accounts, one per kind of access (`src/lib/dev-accounts.ts`): it adds them to `ADMIN_EMAILS` and `TECH_ADMIN_EMAILS` in `.env.local`, keeping what is there, and gives them their CMS roles in the local database. It refuses a database that is not on this machine. Restart the dev server after it changes `.env.local`.

Each account signs in on its own localhost subdomain of the dev server's port, by opening `/api/admin/dev-login` there:

- `tech.localhost` → `tech@example.com`, technical admin: everything
- `publish.localhost` → `publish@example.com`, edits and publishes pages
- `draft.localhost` → `draft@example.com`, edits page drafts
- `reviewer.localhost` → `reviewer@example.com`, reviews applications only

For example `http://publish.localhost:3001/api/admin/dev-login` (add `?next=/admin/cms` to land elsewhere). Cookies are kept per subdomain, so several accounts can be open side by side, and plain `localhost` stays signed out. `?as=publish` signs in on any host. The route answers 404 anywhere but `next dev`.

## Testing

`npm run check-all` runs typecheck, lint and every test with coverage; run it before raising a PR. CI runs the same on every PR and push to `main`, against a Postgres service container.

- `npm test` runs every test once, `npm run test:watch` reruns on change, and `npm run test:coverage` adds coverage (listing uncovered lines when only coverage fails).
- Vitest has four projects: `*.test.ts` runs in node and `*.test.tsx` in jsdom, and `*.db.test.ts(x)` files run in the matching database project. Each database test file gets its own Postgres database, cloned from a template migrated with `netlify/database/migrations/` (`test/pg.ts`), and the app's own `src/lib/db.ts` pool talks to it; never mock the database. Other test files get no database.
- The database tests use `TEST_DATABASE_URL`, or else `DATABASE_URL` from `.env.local` if it points at this machine (`npm run db:up`). Each run names its databases with its own token, so parallel worktrees can share one server. Without Postgres, `npm test` still runs the other tests and each database file fails saying why; `npm run test:no-db` leaves them out. CI always runs them.
- Comments describe the code as it stands, never the edit, and hold no measured numbers.

### Fakes and seams

Only the outside world is faked, and only at a seam. The app reaches Turnstile, Brevo and Slack through `fetch`, so `test/setup-env.ts` replaces it: a request to the app's own origin runs the real route handler (`test/app-fetch.ts`), a request to a service goes to its fake in `test/fakes/`, and any other request throws.

- Fakes have named helpers so a test's intent is visible: `turnstile.solve()`, `turnstile.failNext()`, `emails.to(address)`, `emails.failNext()`. The harness resets them before each test.
- Assert on what would have reached the outside world: the email's recipient and body, the request Turnstile was sent.
- Never `vi.mock` our own modules. If code under `src/` needs faking, give it a seam (a parameter or setter with a production default) and add a fake in `test/fakes/`. `vi.mock` is only for framework edges such as `next/navigation` (`test/setup-dom.ts`) and `next/headers` (`test/next-headers.ts`, mocked by the test file that needs it).
- Fake the clock with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime`; set settings with `vi.stubEnv`. Both are undone after each test.

### Coverage

`src/cms/**` must have 100% line and statement coverage. The threshold applies to each file from the moment it exists under `src/cms/`, so the CMS is written with its tests. Everything else under `src/` has a floor in `vitest.config.mts`: raise it as tests are added, never lower it.

- Never use `/* v8 ignore */`, `/* istanbul ignore */` or any other coverage-exclusion comment.
- Don't remove a defensive guard, or replace it with a `!` assertion, to make a line unreachable. Reach it with a test, or narrow the type at the call site. If a line truly cannot run, say so in the PR.

### Flaky tests

A test that fails once and passes on rerun is a bug to fix now, not noise. Rerun that test file 8 times, find the race, fix it, then rerun it 8 times again until every run passes.
