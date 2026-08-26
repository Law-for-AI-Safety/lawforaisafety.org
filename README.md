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

## Images

This site uses `output: "export"` with `images.unoptimized: true`, so Next's image optimizer does not run — images must be pre-optimized before commit.

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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
