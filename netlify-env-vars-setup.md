# Missing Production Env Vars

Checked directly against Netlify (`netlify env:list --context production`) — these are set: `ADMIN_EMAILS`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_LIST_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `NODE_VERSION`. Everything below is missing from both `production` and `deploy-preview` — without these, the OAuth and admin-session code paths throw immediately at request time (see `.env.example` for the full reference list).

## What to add

| Var | Where the value comes from |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://lawforaisafety.org` — literal, not a secret |
| `LINKEDIN_CLIENT_ID` | [LinkedIn Developer Portal](https://developer.linkedin.com) → your app → **Auth** tab → Client ID (same value as your local `.env.local`, if that app is already working there) |
| `LINKEDIN_CLIENT_SECRET` | Same app → **Auth** tab → Client Secret |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth 2.0 Client → Client ID |
| `GOOGLE_CLIENT_SECRET` | Same page → Client Secret |
| `SESSION_SECRET` | Random 32+ byte secret — `openssl rand -base64 32` in a terminal. Generate a **fresh** one for production rather than reusing your local dev value — keeps the two environments' signing keys independent |
| `EMAIL_HASH_SECRET` | Same as above — `openssl rand -base64 32`, a different fresh value from `SESSION_SECRET` (must not equal it, see `.env.example`) |

If you've already got working LinkedIn/Google apps from local dev (`.env.local`), `LINKEDIN_CLIENT_ID`/`GOOGLE_CLIENT_ID` and their secrets are literally the same values — same app, just needs the production redirect URI registered too (see `oauth-production-setup.md`). `SESSION_SECRET` and `EMAIL_HASH_SECRET` are the two you should actually generate fresh, not copy from local.

## Adding them in Netlify

**Dashboard**: Site configuration → Environment variables → **Add a variable** → enter key/value → choose scope (see below) → Create.

**CLI equivalent** (from this repo, already linked):
```
netlify env:set LINKEDIN_CLIENT_ID "value-here" --context production
```
Repeat per var. Add `--context deploy-preview` too for anything you want working on PR previews (see the caveat below on `NEXT_PUBLIC_SITE_URL` first, though — it's not as simple as just adding it everywhere).

## Scoping — production vs preview

- `SESSION_SECRET`, `EMAIL_HASH_SECRET`, `LINKEDIN_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`: safe to set for **all** contexts (production + deploy-preview + branch-deploy) — same values everywhere is fine, no isolation concern like `BREVO_LIST_ID` had.
- `NEXT_PUBLIC_SITE_URL`: **production only, for now.** This one's genuinely awkward for previews — each deploy preview gets its own dynamic URL (`deploy-preview-3--law-for-ai-safety-org.netlify.app`, changes per PR), and LinkedIn/Google both require an *exact* registered redirect URI match. Setting `NEXT_PUBLIC_SITE_URL` for deploy-preview would need registering every individual preview URL on both provider dashboards to actually work — not practical to maintain. Realistic expectation: OAuth flows only work end-to-end locally or in production; a preview deploy exercising "Verify with LinkedIn" will build the wrong callback URL and fail at the provider, regardless of this var. Not something to fix now — flagging so it's not mistaken for a bug later.

## After adding

Trigger a new deploy (env var changes don't apply retroactively to already-built deploys) — either push a commit or use **Trigger deploy** in the Netlify dashboard. Then re-run the same verification as `oauth-production-setup.md`: go through the apply flow on production and confirm "Verify with LinkedIn"/"Verify with Google" land on the real provider login screens, and confirm `/admin/login` issues a working session.
