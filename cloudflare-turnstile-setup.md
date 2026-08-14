# Cloudflare Turnstile Setup

How to get Turnstile live on the newsletter + apply forms (`NewsletterForm.tsx`, `ApplyForm.tsx`). Scope: Turnstile widget only — no DNS/nameserver change needed. Domain stays on Netlify DNS; Cloudflare account here is only used for the Turnstile product, which works independent of who hosts DNS.

---

## 1. Cloudflare account

If the org doesn't have one: sign up free at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No paid plan, no domain transfer needed.

## 2. Create the Turnstile widget

1. Dashboard → **Turnstile** (left sidebar) → **Add widget**
2. **Widget name**: e.g. `lawforaisafety.org — signup forms`
3. **Domains**: add both:
   - `lawforaisafety.org`
   - `localhost` (needed for local dev — Turnstile allows adding it as a domain even without real DNS)
   - Add the Netlify deploy-preview domain too if previews should also pass (`*.netlify.app`, or the specific preview subdomain pattern the site uses)
4. **Widget mode**: **Managed** (recommended — matches what's already coded: shows an interactive checkbox only when Cloudflare's risk signals warrant it, invisible otherwise)
5. Create → copy the **Site Key** and **Secret Key** shown

## 3. Env vars

Two vars, already declared in `.env.example`:

| Var | Value | Where |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site Key from step 2 | Public — ships in the client bundle |
| `TURNSTILE_SECRET_KEY` | Secret Key from step 2 | Server-only — never exposed to the browser |

**Local dev**: don't use real keys. Cloudflare publishes fixed test keys that always pass (or always fail, for testing the failure path) without needing a Cloudflare account at all:

```bash
# .env.local — always passes
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Other documented test keys, if you want to exercise the failure path (`verifyTurnstile` returning `false` → the `?error=verification` redirect / newsletter 400):

```bash
# always blocks (widget renders, but siteverify always fails)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=2x00000000000000000000AB
TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA
```

**Netlify**: Site settings → Environment variables → add both, scoped to whichever contexts need them (at minimum **Production**; add **Deploy previews** too if the preview domain was registered in step 2, otherwise the widget will fail domain validation on previews). Real keys from step 2, not the test ones.

## 4. Deploy

Redeploy after setting the Netlify env vars (`NEXT_PUBLIC_*` vars are inlined at build time, so a var change alone doesn't take effect until the next build — trigger one from the Netlify dashboard or push a commit).

## 5. Verify it's live

1. Open the deployed site, scroll to `#contact`
2. Confirm the Turnstile badge/checkbox renders below the form fields (Managed mode may render nothing visible until it decides a challenge is needed — that's expected, not a bug)
3. Submit the newsletter form or an application with real details
4. DevTools → Network tab: confirm the POST to `/api/newsletter` (or `/api/auth/*`) returns success, and check server logs / Netlify function logs for no `TURNSTILE_SECRET_KEY` missing-env errors
5. To confirm the failure path works too: temporarily swap in the "always blocks" test keys from step 3, resubmit, confirm you land on `/?error=verification#contact` (or, for the newsletter form, see the inline error message added in `NewsletterForm.tsx`) — then swap real keys back

## Troubleshooting

- **Widget doesn't render at all**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset — `TurnstileWidget.tsx` returns `null` in that case (by design, so a missing key fails open on rendering rather than crashing the form; but that also means the server-side check will then always reject, since there's no token — check `TURNSTILE_SECRET_KEY` is also set).
- **"Invalid domain" error from the widget**: the domain serving the page wasn't added to the widget's domain list in step 2 — add it (exact hostname, including any preview subdomains).
- **Real submissions failing with `Verification failed`**: check `TURNSTILE_SECRET_KEY` in Netlify matches the same widget as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (site key and secret key are paired per-widget — mixing keys from two different widgets always fails).
- **Works locally, fails in production (or vice versa)**: confirm you're not accidentally shipping the CF test keys to production, or the real keys to local dev without `localhost` registered on the widget.
