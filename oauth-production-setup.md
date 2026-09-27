# Production OAuth Redirect URIs

Both LinkedIn and Google OAuth apps were originally registered against `localhost:3001` for local dev. Before this goes live on `https://lawforaisafety.org`, the production callback URLs need to be added to both apps' allowed redirect list — otherwise every OAuth attempt (applicant LinkedIn/Google verification, admin login) fails on production even though it works locally, since these providers reject any `redirect_uri` that isn't explicitly registered.

Five URLs need to be registered in total — three on the LinkedIn app (it's shared between the applicant, admin, and Red Lines Dialogues flows, see `signup-feature-spec.md` → Admin UI → Authentication for why the applicant and admin callbacks must stay on separate routes), two on Google:

| Flow | Callback URL |
|---|---|
| Applicant — LinkedIn | `https://lawforaisafety.org/api/auth/linkedin/callback` |
| Applicant — Google | `https://lawforaisafety.org/api/auth/google/callback` |
| Admin login — LinkedIn | `https://lawforaisafety.org/api/admin/auth/linkedin/callback` |
| Red Lines Dialogues applicant — LinkedIn | `https://lawforaisafety.org/api/red-lines-dialogue/apply/linkedin/callback` |
| Red Lines Dialogues applicant — Google | `https://lawforaisafety.org/api/red-lines-dialogue/apply/google/callback` |

**Status: all five rows registered.**

Direct links to the two consoles (skip the search-around-the-dashboard steps below):
- LinkedIn Developer Portal, this app's Auth tab: https://www.linkedin.com/developers/apps/248390273/auth
- Google Cloud Console, this project's Credentials page: https://console.cloud.google.com/apis/credentials?project=lawforaisafety-org (open the OAuth 2.0 Client ID listed there, `25953206667-lav0j87psaotga1bvoeot0ffar6vbuc2.apps.googleusercontent.com`)

If a fourth application type gets built later, worth revisiting whether it needs its own `/api/<name>/apply/{linkedin,google}(/callback)` routes and redirect URI registrations, or whether the OAuth flows should be generalised behind one shared callback that looks up which flow a given `state` token belongs to (see the note in red-lines-flow.ts). Splitting them was the right call with two application types; a third might tip it.

---

## LinkedIn Developer Portal

Direct link: https://www.linkedin.com/developers/apps/248390273/auth

1. Go to [developer.linkedin.com](https://developer.linkedin.com) → **My apps** → open the app already in use here (client ID `248390273` — same app both callback URLs below get added to; found via the app's own OAuth redirect during local testing, not a secret, safe to use to locate it in the portal), or use the direct link above
2. **Auth** tab → **OAuth 2.0 settings** → **Authorized redirect URLs for your app**
3. Add all three:
   - `https://lawforaisafety.org/api/auth/linkedin/callback`
   - `https://lawforaisafety.org/api/admin/auth/linkedin/callback`
   - `https://lawforaisafety.org/api/red-lines-dialogue/apply/linkedin/callback`
4. Save. LinkedIn allows multiple redirect URLs on one app — no need for a second app registration, and the existing `localhost:3001` ones can stay alongside these for continued local dev.

DONE — all three.

## Google Cloud Console

Direct link: https://console.cloud.google.com/apis/credentials?project=lawforaisafety-org

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select the project this app's OAuth client lives in, or use the direct link above
2. **APIs & Services** → **Credentials** → find the OAuth 2.0 Client ID in use here (`25953206667-lav0j87psaotga1bvoeot0ffar6vbuc2.apps.googleusercontent.com` — again, a client ID, not a secret, fine to search for)
3. Open it, find **Authorized redirect URIs**
4. Add both:
   - `https://lawforaisafety.org/api/auth/google/callback`
   - `https://lawforaisafety.org/api/red-lines-dialogue/apply/google/callback`
5. Save, and add the matching `http://localhost:3001/...` pair for local dev if it isn't there already. Google can take a few minutes to propagate a new redirect URI.

DONE — all rows.

---

## Verifying it worked

Once both are saved (LinkedIn is usually instant; Google can take a few minutes to propagate), the check is simple: go through the apply flow on the live production site and click "Verify with LinkedIn" / "Verify with Google" — a correctly registered redirect lands on the provider's real login/consent screen. A `redirect_uri_mismatch` error (Google) or a generic LinkedIn error page means the URL registered doesn't exactly match — check for a trailing slash, `http` vs `https`, or a typo, since these providers require an exact string match, not a pattern.

**Status: done.** All five rows are registered (see `netlify-env-vars-setup.md` for the companion Netlify env var setup, also done — `NEXT_PUBLIC_SITE_URL`, `LINKEDIN_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `SESSION_SECRET`, `EMAIL_HASH_SECRET` are all present with correct per-context scoping, confirmed directly against Netlify). Still worth a live check: turn applications on in `/admin/settings` and click "Sign in with Google & submit" on `/red-lines-dialogue` in production to confirm the new callback completes end to end, not just reaches Google's screen.
