# Decap CMS — alternative to the Tina CMS spike

## Why this spike

[spike/tina-cms](../../tree/spike/tina-cms) already proved out git-backed CMS editing for the homepage. This branch is the same content/schema ported to [Decap CMS](https://decapcms.org) (formerly Netlify CMS), to compare the two before committing to one for production.

Same scope as the Tina spike: homepage content only (`content/home.json`), nav still derives its links from content data.

## What's been done

- **Content schema** (`public/admin/config.yml`) — same fields as `tina/config.ts`: hero, mission, mechanisms, quote, timeline, team, contact. One `files`-type collection editing `content/home.json` directly.
- **Admin UI** (`public/admin/index.html`) — loads Decap from CDN (`unpkg.com/decap-cms@^3`), no build step, no generated `admin/` output folder like Tina's.
- **Rendering** — `src/app/page.tsx` is a plain server component that imports `content/home.json` directly and renders it. No GraphQL client, no `useTina()`, no `data-tina-field` wiring — Decap has no equivalent to Tina's contextual/visual editing, so there's nothing to wire up here. Rich-text fields (`hero.body`, `story.events[].body`) render via `react-markdown`; the "Bold → wavy underline" trick is preserved by restricting the hero field's markdown toolbar to `["bold"]` and overriding the `strong` renderer.
- **Local editing** — `npm run dev` runs `next dev` and `decap-server` together (via `concurrently`). `decap-server` is Decap's local proxy: with `local_backend: true` in `config.yml`, visiting `/admin/index.html` edits `content/home.json` on disk directly, no login, no cloud account. Same zero-friction local experience as Tina's self-hosted mode.

## What's different from Tina (the actual tradeoffs)

- **No contextual editing.** Tina's biggest selling point — click text on the live page, edit it in a sidebar, see it update before saving — has no Decap equivalent. Decap's preview pane is a separate iframe rendered via `registerPreviewTemplate`, which means duplicating the homepage layout as a second React tree just for the admin preview. Not done here — out of scope for this spike, but it's real ongoing maintenance if picked: every layout change to `page.tsx` needs a matching change in a preview template, or the preview drifts.
- **Auth for non-technical editors (no GitHub account) is the open question.** Tina Cloud sells exactly this: email/password login, they hold a GitHub App and commit on the editor's behalf. Decap's equivalent was Netlify Identity + Git Gateway — but Netlify has deprecated Identity for new sites. It still nominally works, but isn't the supported path going forward, so building on it now is a bet against Netlify's own docs. Alternatives if this gets built for real:
  - Self-hosted OAuth: a small serverless function/Netlify Function trading a GitHub OAuth code for a token. Editors need a GitHub account — the exact constraint Tina Cloud was chosen to avoid (see `spike/tina-cms`'s `TINA_CMS.md`).
  - A third-party hosted OAuth provider for Decap (a few exist, none with Tina Cloud's maturity or free-tier guarantees).
  - Accept editors need GitHub accounts. Simplest, but a real UX regression for non-technical board members.
- **No cloud account, no client ID/token, no per-seat pricing.** Fully open source (MIT), self-hosted admin. This is Decap's strongest point over Tina — no dependency on Tina Cloud's free-tier terms staying free.
- **Simpler build.** No `tinacms build` step, no generated types, no GraphQL schema/client. `npm run build` is just `next build`.

## What's still needed for production

Same three-item shape as Tina's list, different specifics:

1. Decide the auth story (see above) — this is the one open design question, not just config.
2. Wire whichever backend is chosen (`git-gateway` + Identity, or a custom OAuth function) into `backend:` in `config.yml`.
3. No Netlify build-hook requirement for the *save* step itself (Decap commits straight to git same as Tina), but same downstream truth applies: a save is a commit, not a deploy — still need Netlify to auto-build on push (already true today, unrelated to which CMS is picked) for the edit to go live.

## Recommendation basis (for whoever compares the two branches)

Pick Tina if the contextual/visual editing is worth the Tina Cloud dependency and its pricing terms. Pick Decap if avoiding vendor lock-in and cost matters more than click-to-edit UX, and someone's willing to own the OAuth backend piece.
