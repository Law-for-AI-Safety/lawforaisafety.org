# Production OAuth Redirect URIs

Both LinkedIn and Google OAuth apps were originally registered against `localhost:3001` for local dev. Before this goes live on `https://lawforaisafety.org`, the production callback URLs need to be added to both apps' allowed redirect list — otherwise every OAuth attempt (applicant LinkedIn/Google verification, admin login) fails on production even though it works locally, since these providers reject any `redirect_uri` that isn't explicitly registered.

Three URLs need to be registered in total — two on the LinkedIn app (it's shared between the applicant and admin flows, see `signup-feature-spec.md` → Admin UI → Authentication for why those two must stay on separate callback routes), one on Google:

| Flow | Callback URL |
|---|---|
| Applicant — LinkedIn | `https://lawforaisafety.org/api/auth/linkedin/callback` |
| Applicant — Google | `https://lawforaisafety.org/api/auth/google/callback` |
| Admin login — LinkedIn | `https://lawforaisafety.org/api/admin/auth/linkedin/callback` |

---

## LinkedIn Developer Portal

1. Go to [developer.linkedin.com](https://developer.linkedin.com) → **My apps** → open the app already in use here (client ID `248390273` — same app both callback URLs below get added to; found via the app's own OAuth redirect during local testing, not a secret, safe to use to locate it in the portal)
2. **Auth** tab → **OAuth 2.0 settings** → **Authorized redirect URLs for your app**
3. Add both:
   - `https://lawforaisafety.org/api/auth/linkedin/callback`
   - `https://lawforaisafety.org/api/admin/auth/linkedin/callback`
4. Save. LinkedIn allows multiple redirect URLs on one app — no need for a second app registration, and the existing `localhost:3001` ones can stay alongside these for continued local dev.

DONE

## Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select the project this app's OAuth client lives in
2. **APIs & Services** → **Credentials** → find the OAuth 2.0 Client ID in use here (`25953206667-lav0j87psaotga1bvoeot0ffar6vbuc2.apps.googleusercontent.com` — again, a client ID, not a secret, fine to search for)
3. Open it, find **Authorized redirect URIs**
4. Add: `https://lawforaisafety.org/api/auth/google/callback`
5. Save. Same as LinkedIn — the existing `localhost:3001` entry can stay for local dev, this just adds the production one alongside it.

DONE

---

## Verifying it worked

Once both are saved (LinkedIn is usually instant; Google can take a few minutes to propagate), the check is simple: go through the apply flow on the live production site and click "Verify with LinkedIn" / "Verify with Google" — a correctly registered redirect lands on the provider's real login/consent screen. A `redirect_uri_mismatch` error (Google) or a generic LinkedIn error page means the URL registered doesn't exactly match — check for a trailing slash, `http` vs `https`, or a typo, since these providers require an exact string match, not a pattern.

**Status: done.** Both LinkedIn redirect URLs and the Google one are registered (see `netlify-env-vars-setup.md` for the companion Netlify env var setup, also done — `NEXT_PUBLIC_SITE_URL`, `LINKEDIN_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`, `SESSION_SECRET`, `EMAIL_HASH_SECRET` are all present with correct per-context scoping, confirmed directly against Netlify).
