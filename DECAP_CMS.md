# Decap CMS — alternative to the Tina CMS spike

## Why this spike

[spike/tina-cms](../../tree/spike/tina-cms) already proved out git-backed CMS editing for the homepage. This branch is the same content/schema ported to [Decap CMS](https://decapcms.org) (formerly Netlify CMS), to compare the two before committing to one for production.

Same scope as the Tina spike: homepage content only (`content/home.json`), nav still derives its links from content data.

## What's been done

- **Content schema** (`public/admin/config.yml`) — same fields as `tina/config.ts`: hero, mission, mechanisms, quote, timeline, team, contact. One `files`-type collection editing `content/home.json` directly.
- **Admin UI** (`public/admin/index.html`) — loads Decap from CDN (`unpkg.com/decap-cms@^3`), no build step, no generated `admin/` output folder like Tina's.
- **Rendering** — `src/app/page.tsx` is a thin server component that imports `content/home.json` and hands it to `src/app/HomeClient.tsx` (client component) as `initialData`. No GraphQL client, no `useTina()`, no `data-tina-field` wiring. Rich-text fields (`hero.body`, `story.events[].body`) render via `react-markdown`; the "Bold → wavy underline" trick is preserved by restricting the hero field's markdown toolbar to `["bold"]` and overriding the `strong` renderer.
- **Local editing** — `npm run dev` runs `next dev` and `decap-server` together (via `concurrently`). `decap-server` is Decap's local proxy: with `local_backend: true` in `config.yml`, visiting `/admin/index.html` edits `content/home.json` on disk directly, no login, no cloud account. Same zero-friction local experience as Tina's self-hosted mode.
- **Live preview** (`public/admin/preview.js`) — Decap's default preview pane is a generic field dump, not the styled site (no equivalent to Tina's contextual editing out of the box). Instead of hand-rebuilding the homepage layout as a second React tree for Decap's preview iframe, `preview.js` registers a preview template that iframes the *actual* running dev server (`/`) and postMessages each draft edit into it. `HomeClient.tsx`'s `usePreviewData` hook listens for that message (only when embedded in an iframe — same-origin check, no-op on the real deployed site) and re-renders with the draft data instead of `initialData`. Net effect: editing a field in the Decap form updates the real page live, same as Tina's contextual editing, without maintaining a duplicate preview template per field.
  - Two non-obvious gotchas hit while building this, worth knowing before touching either file: `registerPreviewTemplate` for a `files`-type collection keys the registry by the *file's* `name` (`"home"` in `config.yml`), not the collection's `name` (`"content"`) — registering under the wrong key fails silently, no error. And Decap renders its whole preview pane inside its own iframe for style isolation, so `HomeClient.tsx`'s site iframe is nested two levels deep — posting to `window.parent` only reaches Decap's internal iframe (no listener there); it has to be `window.top` to reach `preview.js`, and that also fails silently on the wrong target.

## What's different from Tina (the actual tradeoffs)

- **Live preview took custom wiring; Tina's is built-in.** The iframe+postMessage bridge above gets equivalent live-preview *behavior*, but it's ~120 lines of custom glue (`preview.js` + `usePreviewData`) that Tina gets for free via `useTina()`/`data-tina-field`. It's also not true click-to-edit — there's no "click text on the page to jump to that field in the form" the way Tina does; it's one-directional (form → preview), not preview → form. Maintenance cost is lower than the "duplicate the layout" alternative floated earlier, since it reuses the real `HomeClient.tsx`, but the postMessage contract (`decap-preview-ready` / `decap-preview-update`) is still something to keep in sync if the data shape changes.
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
