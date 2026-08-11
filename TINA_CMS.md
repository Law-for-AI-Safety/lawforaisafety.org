# Tina CMS — homepage content editing

## Why

Non-technical team members (board/team) need to edit homepage copy — hero text, mission statement, team bios, timeline events, etc. — without going through an engineer for every wording change. Tina CMS was chosen over alternatives (e.g. Sanity) because it's git-backed: edits become commits, there's no separate database to run, and it fits the site's fully static export (`output: "export"` in `next.config.ts`, deployed on Netlify).

Editors log into Tina Cloud with email/password — **no GitHub account needed**. Tina Cloud commits on their behalf via a GitHub App installed on this repo.

## Scope

Homepage content only (`content/home.json`, rendered by `src/app/page.tsx` / `src/app/HomeClient.tsx`). The nav (`src/app/Nav.tsx`) derives its links from the same content data (each section has a `navLabel` field) rather than a separate hardcoded list.

The signup/apply feature (`signup-feature-spec.md`) is a separate, later effort — that's app logic (forms, OAuth, a review queue), not CMS content, and isn't touched by this work.

## What's been done

- **Content schema** (`tina/config.ts`) — defines every editable field: hero, mission, "how we work" mechanisms, Brussels-effect quote, story timeline, team members, contact. Heading levels and Tailwind size classes stay hardcoded in the JSX templates (not editable) — Tina only owns text content, so a non-technical editor can't break the visual hierarchy.
- **Content data** (`content/home.json`) — today's copy, migrated verbatim from the old hardcoded `page.tsx` arrays/strings.
- **Rich-text**: two fields use Tina's rich-text type (`story.events[].body`, for the inline italic/link in the timeline; `hero.body`, for the wavy-underline emphasis phrase — toolbar restricted to just a "Bold" button, which is overridden at render time to apply the wavy-underline styling instead of actual bold). Rich-text fields are stored as **markdown strings** on disk (Tina's format, even inside a JSON document) and parsed into structured content automatically by Tina's query layer.
- **Visual (contextual) editing** — the homepage is wired up per [Tina's contextual editing guide](https://tina.io/docs/contextual-editing/react):
  - `src/app/page.tsx` — thin server component, fetches content via Tina's generated GraphQL client.
  - `src/app/HomeClient.tsx` — client component wrapped in `useTina()`, with `data-tina-field` attributes on every editable element. In the Tina admin, clicking text on the live page preview jumps you to that field in the sidebar form, and edits appear live before saving.
- **Local editing** — fully working right now with no Tina Cloud account: `npm run dev` starts Tina's local GraphQL server + admin UI (self-hosted mode). Visit `/admin/index.html` to edit `content/home.json` directly.
- **Build wiring** — `package.json`: `tinacms` moved to real `dependencies` (needed at runtime for rendering), `@tinacms/cli` added as a dev dependency, `dev`/`build` scripts wrapped with `tinacms dev` / `tinacms build`.

## What's still needed for production

Three things, all outside this repo:

1. **Register the project at [Tina Cloud](https://app.tina.io)** and install their GitHub App on this repo. This is what lets Tina Cloud commit content edits back to git on the editor's behalf. (See [pricing](https://tina.io/pricing) — a free "Starter" tier exists, worth confirming current limits before committing since plans change.)
2. **Add Netlify environment variables**, from the Tina Cloud project dashboard:
   - `NEXT_PUBLIC_TINA_CLIENT_ID`
   - `TINA_TOKEN`
3. **Add a Netlify build hook**, and paste its URL into Tina Cloud's project settings, so that saving an edit in the admin UI triggers an automatic rebuild + redeploy. Without this, edits save to git but the live site won't update until the next manual deploy.

Once those three are in place, `npm run build` (which runs `tinacms build && next build`) will succeed in Netlify's CI the same way it already does locally, and `/admin` goes live for editors at `lawforaisafety.org/admin`.

### Note on build delay

Because the site is fully static, an edit isn't instant — save in Tina → commit → Netlify build hook fires → site rebuilds → live. Typically a minute or two, not real-time. Worth mentioning to editors so they don't expect an instant refresh.
