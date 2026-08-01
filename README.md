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

That's the only command needed — `predev` (`scripts/db-ensure.mjs`) handles starting the container and running migrations before `next dev` starts.

`npm run db:down` stops the container (data persists in a Docker volume). `npm run db:reset` wipes it and starts clean — use when migrations get out of sync. If you ever run `npm run db:migrate` directly (rather than through `npm run dev`), export `DATABASE_URL` in your shell first — unlike `predev`, the bare drizzle-kit command doesn't read `.env.local` itself.

Requires Docker Desktop (or another Docker Compose–compatible runtime) running locally. Production uses Netlify DB (managed Postgres/Neon) instead — see the feature spec for provisioning.

You'll also need real values for `LINKEDIN_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`/`SLACK_BOT_TOKEN`, and the generated secrets (`SESSION_SECRET`, `EMAIL_HASH_SECRET`) — see `.env.example` for what each is for.

## Images

`images.unoptimized: true` is set (independent of the deploy target — see below), so Next's image optimizer does not run — images must be pre-optimized before commit.

Full-res originals live in `design/images-src/` (not the shipped assets). To add or replace a photo:

1. Drop the source JPG/PNG in `design/images-src/`, named to match how it's used (e.g. `team-group.jpg`).
2. If it needs a specific display size, add a width override in `scripts/optimize-images.mjs` (`WIDTH_OVERRIDES`) — set it to 2x the max render width from the image's `sizes` prop in `page.tsx`. Otherwise it falls back to a 1920px cap.
3. Run `npm run images` (or just `npm run build`, which runs it automatically via `prebuild`).

This resizes and converts each source image to WebP (q80) into `public/images/`, which is what's committed and shipped. The script skips files that are already up to date.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

Deployed on Netlify via [`@netlify/plugin-nextjs`](https://docs.netlify.com/frameworks/next-js/overview/), which runs this as a full Next.js server (Route Handlers, cookies, dynamic routes) rather than a static export — required for the signup & vetting feature's OAuth/admin routes. See `netlify.toml`.
