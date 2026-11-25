# lawforaisafety.org

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Signup & vetting feature — local dev

The `/apply` and `/admin` routes need a Postgres database. Locally:

```bash
cp .env.example .env.local   # fill in the OAuth/Resend/Slack values below
npm run dev                  # starts Postgres in Docker, migrates it, then boots Next
```

That's the only command needed — `predev` (`npm run db:ensure`, i.e. `scripts/db-ensure.mjs`) makes sure the database at `DATABASE_URL` is up, starting the Docker container if nothing is answering there, and runs migrations before `next dev` starts. If you already run Postgres some other way, point `DATABASE_URL` at it and Docker isn't needed.

The container listens on host port **5440** (not 5432, to avoid clashing with other local Postgres instances). To use another port, set `DB_PORT` in `.env.local` and change the port in `DATABASE_URL` to match.

`npm run db:down` stops the container (data persists in a Docker volume). `npm run db:reset` wipes it and starts clean — use when migrations get out of sync. `npm run db:migrate` on its own reads `.env.local` too.

`npm run db:seed` inserts 9 sample pending applications into the admin queue — one for every combination of verification method (LinkedIn / Google / no-verification name+email) and credential type (LinkedIn URL / CV / position statement), so every badge and banner state in `/admin` is reachable without doing a real OAuth round trip. CV rows get a minimal placeholder PDF written to the local blob fallback so the PDF.js viewer has something to render. Re-running it is safe — same fixed IDs, old rows are deleted and replaced.

CV uploads outside a real Netlify deploy (plain `next dev`, or this seed script) fall back to on-disk storage at `.local-blobs/` (gitignored) — see `src/lib/cv-storage.ts`.

Requires Docker Desktop (or another Docker Compose–compatible runtime) running locally, unless `DATABASE_URL` points at a Postgres you run yourself. Production uses Netlify DB (managed Postgres/Neon) instead — see the feature spec for provisioning.

### Schema changes

Migrations live in `netlify/database/migrations/` — Netlify Database's directory, which Drizzle Kit is pointed at (`drizzle.config.ts`). Netlify applies any new files there, in order of the number each name starts with, just before a production deploy or deploy preview is published; a failing migration blocks the deploy. Deploy previews run against their own database branch, copied from production.

1. Edit `src/drizzle/schema.ts`.
2. `npm run db:generate` — writes the SQL file, named by its UTC creation time (`20261125143000_<name>.sql`), with Drizzle's `meta/` snapshot and journal entry. A name given with `-- --name` must be lowercase letters, digits, `_` or `-`, or Netlify won't apply it.
3. `npm run dev` — applies it to the local Docker database.
4. Commit the SQL and `meta/` files with the code that needs them, and deploy.

Netlify orders migrations by the number before the first `_`, and blocks a deploy if an applied migration has gone or been changed, or if a new one's number is at or below the highest applied. The early migrations were numbered in sequence (`0000`, `0001`, ...) and keep those names, since production has them applied; every later one is a timestamp, which is always higher. `test/migrations.test.ts` checks that Netlify's order and Drizzle's journal agree.

If `main` gains a migration while your branch has one, rebase, then delete your SQL file, its snapshot and its journal entry and run `npm run db:generate` again, so yours comes after everything on `main` (Drizzle also refuses two snapshots that follow the same parent). Your local database has the old one applied too, and Drizzle skips anything older than the newest it applied, so run `npm run db:reset` and then `npm run dev`. The deploy preview's database still has your old migration applied, so that preview's deploys are refused until its database is reset; production is unaffected.

Never run `drizzle-kit migrate` or `push` against the Netlify database, and never edit a migration that has already been deployed — add a new one. Keep migrations backwards-compatible (new tables, nullable columns): they are applied moments before the new code goes live, so the old code briefly runs against the new schema.

You'll also need real values for `LINKEDIN_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`/`SLACK_BOT_TOKEN`, and the generated secrets (`SESSION_SECRET`, `EMAIL_HASH_SECRET`) — see `.env.example` for what each is for.

## Newsletter

Every admin writes, tests and schedules the newsletter at `/admin/newsletters`; Brevo sends it to the list. An issue can also go on the website: tick **Also publish on the website** on the issue, before or after sending. It is off by default, so an issue about an event or a deadline stays in inboxes only.

- `/newsletter` is the newsletter's page: the sign-up, then the issues on the website, newest first. Each issue has its own page at `/newsletter/<slug from the subject>`, with a share card and a sitemap entry, and is announced to IndexNow as it goes up or comes down. The sign-up flow's pages (`/newsletter/confirm`, `confirmed`, `invalid`) are reserved: no issue takes their address (`RESERVED_ISSUE_SLUGS`, checked by a test against the folders there).
- A ticked issue is shown only once Brevo says it was sent, never just because its send time has passed. A send now is checked at once. A scheduled one goes up when someone next opens the newsletter admin page, or at the latest at the next run of the sweep (every 6 hours, `src/app/api/cron/sweep`). It gets its address when Brevo takes it, and keeps it for good once it has been sent, so the address never passes to another issue.
- Unticking takes the page down at once (a 404, out of the list and the sitemap). The email, sent or scheduled, is never touched. Cancelling a scheduled issue also keeps it off the website.
- The page shows the body as sent, through the CMS rich-text renderer, without Brevo's merge tags (`{{ contact.FIRSTNAME }}`), which have no subscriber to fill them in. A sent issue can't be edited, so a correction on the website means unticking it.
- The sign-up form (`src/app/NewsletterSignup.tsx`, the homepage's form) is in the footer of every page that has no sign-up of its own: not the homepage, `/newsletter`, an issue's page, or the confirmation pages. The footer's form loads Cloudflare Turnstile only once a visitor starts on it.

## Images

`images.unoptimized: true` is set (independent of the deploy target — see below), so Next's image optimizer does not run — images must be pre-optimized before commit.

Full-res originals live in `design/images-src/` (not the shipped assets). To add or replace a photo:

1. Drop the source JPG/PNG in `design/images-src/`, named to match how it's used (e.g. `team-group.jpg`).
2. If it needs a specific display size, add a width override in `scripts/optimize-images.mjs` (`WIDTH_OVERRIDES`) — set it to 2x the max render width from the image's `sizes` prop in `page.tsx`. Otherwise it falls back to a 1920px cap.
3. Run `npm run images` (or just `npm run build`, which runs it automatically via `prebuild`).

This resizes and converts each source image to WebP (q80) into `public/images/`, which is what's committed and shipped. The script skips files that are already up to date.

## DNS

Domain registrar is GoDaddy, but DNS records are managed by Netlify, not the registrar (confirmed by NS records pointing to `nsone.net`, Netlify's DNS provider). Make DNS changes in Netlify's dashboard, not GoDaddy.

Current records and their purpose:

- **A** (apex + `www`) — point to Netlify's edge network; this is what serves the site. `www` redirects to the apex domain (Netlify domain alias), it's not a separate site.
- **TXT** (`brevo-code:...`) — ownership verification for Brevo (email/marketing platform), unrelated to hosting.
- **MX** (`smtp.google.com`) — email for this domain routes to Google Workspace/Gmail.
- **TXT** (SPF, `v=spf1 include:_spf.google.com ~all`) — authorizes Google's servers to send mail as this domain.
- **TXT** (`google._domainkey`) — DKIM key authenticating outbound mail sent from Google Workspace.
- **CNAME** (`brevo1._domainkey`, `brevo2._domainkey`) — DKIM delegation authenticating outbound mail sent via Brevo.
- **TXT** (`_dmarc`, `p=quarantine`) — DMARC policy; reports go to `web@lawforaisafety.org` and Brevo.
- No **CAA** — no certificate authority restriction; Netlify auto-provisions TLS.

`lawforaisafety.org` was originally a secondary domain under the Workspace account `lawforsafeai.org`; it's now converted to a **domain alias**, so every mailbox has a matching `@lawforaisafety.org` address, set as default send-as via a one-off GAM script (not checked into this repo).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

Deployed on Netlify via [`@netlify/plugin-nextjs`](https://docs.netlify.com/frameworks/next-js/overview/), which runs this as a full Next.js server (Route Handlers, cookies, dynamic routes) rather than a static export — required for the signup & vetting feature's OAuth/admin routes. See `netlify.toml`.
