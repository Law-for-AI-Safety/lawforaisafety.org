# Signup & Vetting Feature Spec

## Overview

One page, two purposes, combinable:

1. **Newsletter signup** — email only, no vetting beyond a real double opt-in confirm-click. Straight to Brevo (Phase 2) / held for backfill (Phase 1, see Implementation Phasing).
2. **Apply to work with us** — legal professionals. Applicant authenticates via LinkedIn **or Google** (identity proof) — or, if they have neither, submits a bare name + email with **no identity proof at all**. Submits details, enters a manual review queue. On approval: subscribed to the mailing list via Brevo and invited to the Slack workspace.

A visitor can do either or both in one pass — e.g. check "also subscribe me to the newsletter" while applying, without going through review twice.

Applicants without a LinkedIn profile are supported: they authenticate via Google and must supply at least one professional identity signal (LinkedIn profile URL, CV/resume PDF, or a written position statement). LinkedIn is strongly recommended where available — it enables photo cross-verification — but is not required.

Applicants without *either* LinkedIn or Google are also supported, at a real trust cost: they type a name and email directly, with zero identity verification behind it (`auth_provider = 'email'`). Same credential rule applies (at least one of LinkedIn URL / CV / position statement), but the applicant's name and email are entirely self-reported and spoofable — the admin UI flags these rows with a hard warning distinct from (and stronger than) the existing Google-is-weaker-than-LinkedIn framing.

---

## Layman's Explanation

There is one page with two things you can do — and you can do both at once if you want.

**Just want the newsletter?** Enter your email and click Subscribe. You'll get a confirmation email to verify your address, and once you click the link in that email you're on the list.

**Want to work with us?** Fill in your details and verify your identity — either through LinkedIn or Google (your choice). This takes you to their login page, and once you confirm there, you're brought back. We never see your password; they just tell us who you are.

To help us verify your professional background, you'll also need to provide at least one of:
- Your LinkedIn profile URL *(strongly recommended — makes it much easier for us to verify your background)*
- A CV or resume (PDF)
- A brief written statement of your current role and why you're relevant

You can also leave a general comments field with anything else you'd like us to know.

After that, your application sits in a queue. One of our reviewers looks at it — they check your professional background fits. They can approve or reject it.

- **Approved**: you get a welcome email, and we invite you to our Slack workspace.
- **Rejected**: nothing further happens (we discard your details from our active list).

If you ticked "also subscribe me to the newsletter" while applying, you're added to the mailing list automatically on approval — no separate step needed.

If something goes wrong during the identity verification step (you accidentally close the window, or deny access), your form details are saved so you don't have to retype them — just try again.

---

## User-Facing Flow

### Newsletter only

1. User enters email address, clicks **"Subscribe"** (form also carries a hidden honeypot field — see Abuse Protection below)
2. `/api/newsletter` validates the honeypot is empty, then calls Brevo's `POST /contacts/doubleOptinConfirmation` (double opt-in — see Brevo dependency notes)
   - **Phase 1 (no provider wired up yet)**: skip the provider call, insert a row into `newsletter_signups` instead (with a random `confirmation_token`, `confirmed_at = null`), and send a **real double opt-in confirm-link email via Brevo's transactional API** (already wired up for transactional email — see API Dependencies → Transactional Email). This isn't a placeholder courtesy notice — clicking the link is a genuine verification gate: `/api/newsletter/confirm?token=…` looks up the row by token, sets `confirmed_at = now()`, clears the token (single use). No token match → generic "invalid or already used" message, no enumeration signal. Phase 2 can keep this mechanism or hand the gate off to the provider's own DOI flow instead — either is fine, see Implementation Phasing.
3. Confirmation shown inline (no separate success page needed) — same message whether the honeypot caught a bot or not, since a bot doesn't need to be told it was caught. Message asks the user to check their inbox and click the confirm link.

### Apply to work with us (optionally + newsletter)

1. User fills in:
   - LinkedIn profile URL (self-reported, optional but strongly recommended — nudge text on the form: *"Providing your LinkedIn profile helps us verify your background faster"*)
   - CV/resume upload (PDF, max 5 MB) — optional if LinkedIn URL provided
   - Position statement (free text — "describe your current role and why you're relevant") — optional if LinkedIn URL or CV provided
   - **Validation**: at least one of LinkedIn URL, CV upload, or position statement must be non-empty. Form blocks submit if all three are empty.
   - Organisation / firm
   - General comments (free text, optional — anything else the applicant wants to add)
   - Checkbox: "Also subscribe me to the newsletter" (`newsletter_opt_in`)

**No-verification fallback**: below the two OAuth buttons, a "Don't have LinkedIn or Google? Provide your name and email instead" toggle reveals **Full name** and **Email address** fields plus a **"Submit application"** button. Clicking it skips OAuth entirely — no `state_token`, no draft/redirect round trip, no provider identity of any kind. Same credential rule applies (still need at least one of LinkedIn URL / CV / position statement). `auth_provider = 'email'`; `provider_id` is set to the normalized (lowercased) email itself, since there's no OAuth `sub` to key resubmission-dedup on. The row goes straight from form submission to `status = 'pending'` — the resubmission/reapplication checks below (provider_id + auth_provider match, then email-hash lookup against `processed_applications`) still run, just synchronously in the same request instead of after an OAuth callback. **This path has zero identity proof** — name and email are exactly what the applicant typed, unverified and spoofable. The admin UI must flag this distinctly and more strongly than the Google-vs-LinkedIn distinction (see Admin UI, Manual Review).

2. User clicks **"Verify with LinkedIn"** or **"Verify with Google"** (two buttons, side by side):
   - If a CV was attached, it is uploaded to Netlify Blobs immediately (before the OAuth redirect) — the blob key is stored on the draft row. File is validated server-side: magic-byte check (`%PDF-` prefix) and size cap enforced at upload time, not just MIME type.
   - Form fields are saved server-side as a `status: draft` application row with a random opaque `state_token` and `auth_provider` (`linkedin` or `google`) set to whichever button was clicked
   - Before inserting, the same request sweeps old litter: `DELETE FROM applications WHERE status = 'draft' AND created_at < now() - interval '1 day'` — also deletes any associated Netlify Blobs (by `cv_blob_key`) before removing the rows
   - Browser is redirected to the chosen provider's OAuth with `&state=<state_token>` attached
*(Steps 3–4 are OAuth-only — the no-verification fallback above skips straight to step 5.)*

3. Provider returns: verified name, email, profile picture, member ID (`sub`) — see API Dependencies for what each provider actually returns
4. Callback route (`/api/auth/linkedin/callback` or `/api/auth/google/callback`) receives either `?code=...&state=<state_token>` (success) or `?error=...&state=<state_token>` (user cancelled/denied consent):
   - Looks up the draft row by `state_token` (never trust a raw row `id` passed through `state`)
   - Rejects if the token doesn't exist, was already consumed, or the draft is stale (older than ~1 hour) — CSRF/replay protection
   - **On `error`**: set `auth_error` to the provider's error code on the draft row (leave `status` as `draft`). Show "Error verifying identity, please try again" with retry buttons for both providers — applicant can switch provider on retry without retyping the form. Mint a fresh `state_token`, update `auth_provider` to whichever provider they retry with, clear `auth_error`. If never retried, swept by 1-day draft cleanup (including CV blob deletion).
   - **Resubmission check** (only reached on success): two lookups in order:
     1. Look up `applications` by `provider_id` (`sub` from OAuth) + `auth_provider` with `status = pending`. If found: discard the new draft row (delete its CV blob if any), update the existing application's `organisation`/`position_statement`/`comments`/`linkedin_url`/`cv_blob_key`/`newsletter_opt_in` with the freshly submitted values.
     2. If not found: hash the OAuth-verified email (HMAC-SHA256 with `EMAIL_HASH_SECRET`) and look up `processed_applications`:
        - `outcome = approved` → silently discard the draft row (delete CV blob); show the same generic confirmation screen (do not reveal they are already a member — enumeration risk)
        - `outcome = rejected` → proceed to create a new pending row, but store the `processed_applications.id` on it so the detail view can surface the prior rejection date and notes to the reviewer
     - If neither: fill in the OAuth-verified fields (`name`, `email`, `picture_url`, `provider_id`, `auth_provider`) on the draft row itself, flip `status` to `pending`.
     - Either way, clear `state_token`, and — critically — show the applicant the **same confirmation screen** regardless of which branch ran.
     - **Race condition**: two tabs/devices completing OAuth for the same account at once could both pass the "not found" check before either has written — the second `INSERT`/`UPDATE` then hits the `provider_id` unique constraint. Catch that constraint violation specifically and retry the write as an update against the row the other request just created. Both requests still end up showing the same generic confirmation screen.
5. Application submitted — user sees confirmation screen ("We'll review your application and be in touch")
6. Reviewer is notified via a Slack message to an admin channel (e.g. `#admin-review`), sent through a Slack incoming webhook, with a direct link to `/admin/applications/[id]`. Message includes the auth provider used (LinkedIn / Google / "email only — unverified") so reviewers know at a glance what identity signals are available.
7. Reviewer approves or rejects via admin interface or direct API call
   - Reviewer opens the submitted LinkedIn profile URL and checks the name/photo match the OAuth-verified `name`/`picture` — catches spoofed or mismatched profile links. No cryptographic tie between the submitted URL and the OAuth identity, so this manual check is the only safeguard.
8. On approval:
   - Brevo: subscribe applicant to mailing list, **if `newsletter_opt_in` was checked** (applying doesn't imply newsletter interest by default — keep it an explicit opt-in)
   - Slack: on standard plans (the expected case), admin interface checks `users.list` for an existing match on the applicant's email, then surfaces it for the reviewer to manually invite via Slack's UI as part of the same approval action — see API Dependencies
9. Applicant receives approval email (Brevo transactional API)
   - If `newsletter_opt_in` was also checked, a **second, separate** email confirms the newsletter signup — distinct send from the approval email, same courtesy-notice content as the standalone newsletter path (see User-Facing Flow → Newsletter only, and Implementation Phasing for the Phase 1 stubbed version). Two things happened (approved to work with us; added to the list), two emails — don't merge into one.

On approval or rejection: the application row is deleted and all PII purged immediately after the decision is recorded — including deletion of the associated CV blob from Netlify Blobs if one was uploaded. A row is inserted into `processed_applications` with the peppered email hash, outcome, timestamp, and (for rejections) the reviewer notes. See State Model.

**Note**: a `draft` row that never completes (user closes the consent screen, denies access, browser crash) is expected and harmless — it's excluded from every admin view (which only ever query `status = pending`) and gets swept by the cleanup step above, including deletion of any associated CV blob.

---

## State Model

Applications need to be stored between submission and review. Newsletter-only signups do **not** get a record here — they go straight to Brevo, which is its own source of truth for that list.

Each application record holds:

| Field | Notes |
|---|---|
| `id` | UUID, primary key |
| `created_at` | Timestamp |
| `name` | From OAuth provider (verified) for `linkedin`/`google`. Self-reported and **unverified** for `auth_provider = 'email'`. Null while `status = draft` |
| `email` | From OAuth provider (verified) for `linkedin`/`google`. Self-reported and **unverified** for `auth_provider = 'email'`. Null while `status = draft` |
| `picture_url` | From OAuth provider (verified), for reviewer to compare against profile. Always null for `auth_provider = 'email'` — nothing to show. Null while `status = draft` |
| `auth_provider` | `linkedin`, `google`, or `email` — `email` means no OAuth at all, just a self-reported name/email (see User-Facing Flow → No-verification fallback). Set when draft row is created (before OAuth completes) for the OAuth paths; set directly for `email` since there's no draft/redirect round trip |
| `provider_id` | OAuth `sub` claim for `linkedin`/`google`. For `auth_provider = 'email'`, the normalized (lowercased) email itself stands in as the identity key — no real external ID exists. Null while `status = draft`; unique among non-draft rows — this is the resubmission key (see User-Facing Flow) |
| `organisation` | From form (self-reported, unverified) |
| `linkedin_url` | From form (self-reported, unverified, optional). Strongly recommended; reviewer cross-checks name/photo against this. |
| `cv_blob_key` | Netlify Blobs key for uploaded CV/resume PDF. Nullable — only set if applicant uploaded a CV. Blob is deleted on approve/reject/draft cleanup. |
| `position_statement` | From form (free text — applicant's description of their current role and relevance). Nullable — only required if neither `linkedin_url` nor `cv_blob_key` is provided. |
| `comments` | From form (general comments field, always optional). Nullable. |
| `newsletter_opt_in` | Boolean, from form checkbox — whether to also subscribe to Brevo on approval |
| `newsletter_sync_status` | `null` / `synced` / `failed` / `deferred` — set when the approval-time Brevo subscribe call runs, so a failure is visible in the admin UI (with a retry action) rather than silently vanishing. Stays `null` if `newsletter_opt_in` was never checked. `deferred` = Phase 1 state, no provider wired up yet — same retry-button UI as `failed` handles the backfill once Phase 2 lands (see Implementation Phasing). **Not yet renamed in code** — the column/type is still `mailchimp_sync_status` in `src/drizzle/schema.ts` and the `0001_create_applications` migration below; this is the target name for the Phase 2 refactor, not the current column |
| `state_token` | Random opaque token, set when the draft row is created, cleared once the OAuth callback consumes it. Used to safely round-trip the row through the OAuth redirect (see User-Facing Flow) — never expose the raw `id` in the OAuth `state` param |
| `auth_error` | Text, nullable — set to the provider's error code (e.g. `access_denied`) if the callback receives an error instead of `code` (user cancelled/denied consent). Cleared on a successful retry. |
| `status` | `draft` / `pending` / `approved` / `rejected` — `draft` = form saved, OAuth not yet completed (or abandoned). Both `approved` and `rejected` are transient: on decision the row is deleted and PII purged (including CV blob); a minimal record moves to `processed_applications` |
| `reviewed_at` | Timestamp, nullable |
| `reviewed_by` | Text, nullable — OAuth-verified email of the reviewer who made the call (no FK; admin identity comes from the session cookie, not a DB table) |
| `reviewer_notes` | Optional, nullable. On rejection, copied to `processed_applications` before this row is deleted. On approval, discarded (no ongoing need to retain reasoning) |
| `prior_rejection_id` | UUID FK → `processed_applications.id`, nullable — set when a reapplicant is detected at OAuth callback time, so the detail view can surface the prior rejection date and notes |

There is no `admin_users` table. Admin identity is established via LinkedIn OAuth at login time and carried in the session cookie. The permitted admin list lives in the `ADMIN_EMAILS` env var.

### `processed_applications` table

Stores a minimal pseudonymous record for each decided application — both approved and rejected. No PII; the application row is deleted once a decision is made. Used to detect reapplications without retaining identifying data.

| Field | Notes |
|---|---|
| `id` | UUID, primary key |
| `email_hash` | HMAC-SHA256 of the applicant's LinkedIn-verified email, keyed with `EMAIL_HASH_SECRET`. Deterministic — same email always produces the same hash, enabling lookup on reapplication |
| `outcome` | `approved` / `rejected` |
| `processed_at` | Timestamp |
| `reviewer_notes` | Nullable. Populated for rejections only — copied from the application row before it is deleted. Detached from all identifying data at this point. Reviewer is warned at write time not to include names or other identifying details (see Admin UI) |

---

## Manual Review

No automated scoring. Checks vary by what the applicant provided:

**LinkedIn-authenticated applicants (strongest signal):**
- Does the submitted LinkedIn profile URL's name and photo match the OAuth-verified `name`/`picture_url`? (catches spoofed/mismatched profile links)
- Is the LinkedIn profile consistent with a legal professional? (barrister, solicitor, academic lawyer, policy/legal researcher)
- Does the organisation match?
- Is the profile substantive (not newly created, has employment history)?

**Google-authenticated applicants (weaker signal — admin UI flags these):**
- No LinkedIn OAuth, so no photo from the professional network. Reviewer compares the Google-verified `picture_url` against the LinkedIn profile URL if one was provided — less reliable than LinkedIn OAuth photo.
- If a CV was uploaded: reviewer opens it in the built-in PDF viewer (see Admin UI) and checks credentials manually.
- If only a position statement was provided: reviewer applies extra scrutiny — no external profile to cross-check.
- Organisation and comments still reviewed as normal.

**No-verification applicants (`auth_provider = 'email'`, weakest signal — admin UI hard-flags these):**
- No OAuth of any kind — `name` and `email` are exactly what the applicant typed, unauthenticated. Nothing ties this application to a real account or inbox the applicant actually controls.
- No `picture_url` at all, so no photo cross-check is possible even against a submitted LinkedIn URL.
- Treat the submitted LinkedIn URL / CV / position statement as the *entire* basis for the decision — apply the same scrutiny as the Google case, plus assume the name/email themselves could be fabricated. If anything about the identity claim doesn't add up, reject rather than approve on the strength of self-reported credentials alone.
- Organisation and comments still reviewed as normal.

Reviewer approves or rejects via a simple admin page (see Admin UI below) — chosen over one-click email links since the reviewer needs to see the profile, organisation, and supporting materials side by side before deciding, not just click approve blind.

---

## Admin UI

### Authentication

Admins log in via LinkedIn OAuth — the same LinkedIn app already used for applicant verification. No username/password, no `admin_users` table, no password hashing.

Whitelist of permitted admin emails stored in env var `ADMIN_EMAILS` (comma-separated). On successful LinkedIn callback, if the verified email is not in the whitelist, deny access and show an error. Adding or removing an admin requires updating the env var and redeploying — acceptable for a handful of reviewers.

- **Login** (`/admin/login`): a single "Log in with LinkedIn" button; clicking it initiates the admin OAuth flow
- Admin OAuth uses a **separate callback route** (`/api/admin/auth/linkedin/callback`) from the applicant flow (`/api/auth/linkedin/callback`) — the two flows must not share a callback, to prevent an admin login attempt from accidentally creating an application row
- Admin OAuth state param is a short-lived signed token (same pattern as applicant flow) — carries no row ID since there is no draft row, just enough to verify the round-trip and detect CSRF
- On successful callback: verified email checked against `ADMIN_EMAILS`; if permitted, issue a signed `httpOnly`, `Secure`, `SameSite=Lax` session cookie (signed JWT containing the admin's LinkedIn email and name — no DB lookup needed)
- All `/admin/*` pages and `/api/admin/*` routes verify this cookie server-side
- **Logout** (`/api/admin/logout`): clears the cookie
- **Dependency risk**: if LinkedIn is down, admins cannot log in. Acceptable given LinkedIn is already load-bearing for the applicant flow — its uptime is already a prerequisite for the system to function

### Pages

- **List view** (`/admin`): all applications with `status = pending`, **oldest first** — surfaces whoever's been waiting longest, rather than newest-first burying older applications below a wall of recent ones. Shows name, organisation, submitted date, and an **auth provider badge** (`LinkedIn` / `Google`) at a glance. Row is lightweight (a handful of fields), so a plain unpaginated list holds up fine even as volume grows — pagination isn't worth building until it's a demonstrated problem, not preemptively.
- **Detail view** (`/admin/applications/[id]`): everything the reviewer needs for one decision on one screen —
  - **Auth provider badge** — prominent `LinkedIn` or `Google` label. For Google-authed applications, an additional notice: *"Verified via Google — no LinkedIn OAuth. Apply extra scrutiny to identity signals below."* For `auth_provider = 'email'`, the badge instead reads `Unverified` (red, not navy) with a stronger banner: *"No identity verification at all — name and email are entirely self-reported, not tied to any real account. Treat as unverified until independently confirmed; apply maximum scrutiny to the credentials below."*
  - OAuth-verified `name`, `email`, `picture_url` (rendered as an image, for the name/photo cross-check)
  - Self-reported `linkedin_url` (as a clickable link, opens in new tab) — shown with a note that it is self-reported and unverified
  - If a CV was uploaded (`cv_blob_key` set): an inline **PDF viewer** (rendered via PDF.js — no download required, no native plugin, sandboxed in-browser JS renderer). Reviewer sees the CV without it touching their filesystem.
  - `position_statement` if provided
  - `organisation`, `comments`
  - Whether `newsletter_opt_in` was checked
  - If `prior_rejection_id` is set on this application: a prominent warning banner — "Previously rejected on [date]" — with the prior `reviewer_notes` from `processed_applications` displayed beneath it, so the reviewer has context before deciding
  - A multiline text field (textarea) for `reviewer_notes` — free-text, optional. Internal only, not shown to the applicant. Labelled with a nudge: *"Do not include names or other identifying details — notes are retained after rejection."* On rejection, notes are copied to `processed_applications`; on approval, discarded. Either way, the application row is deleted and all PII purged immediately after the decision is saved (including CV blob deletion from Netlify Blobs)
  - Approve / Reject buttons, calling the existing `/api/admin/approve/[id]` and `/api/admin/reject/[id]` routes — these set `reviewed_by` from the logged-in session, save whatever's in the `reviewer_notes` textarea, insert a `processed_applications` row, delete the CV blob if any, then delete the application row
  - On approve: after the Brevo/dedup-check logic runs and before the application row is deleted, show the "Invite to Slack" button (copies email + opens Slack admin invites page — see Slack Option B). The email is no longer available after the row is deleted, so this must happen in the same response
- Optional: a `/admin` filter/tab for `approved` / `rejected` history, useful for volume tracking (see Open Questions) but not required for v1

**Multiple reviewers (up to 3–4, starting at 1)**: no claiming/locking mechanism for v1 — with this few reviewers, two people opening the same application at once is rare, not worth building UI for pre-emptively. The approve/reject routes should still be defensive about it though: check `status` is still `pending` at write time and no-op (or return a clear "already reviewed by X" error) rather than silently double-processing if two reviewers do collide on the same item.

---

## Database

Deploy on **Netlify Database** (managed Postgres, powered by Neon) and **Netlify Blobs** (for CV uploads). Both are first-party to Netlify — no separate accounts needed.

**Update, post-spec**: the `netlify db:create` CLI command referenced below no longer exists — Netlify's DB product moved to an install-and-deploy model. Provisioning is now: add the `@netlify/database` package as a dependency, then deploy — Netlify auto-provisions a Neon-backed Postgres on that deploy and injects the connection string as `NETLIFY_DB_URL` (not `DATABASE_URL`). `src/lib/db.ts` and `drizzle.config.ts` both read `process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL`, so local dev (which sets `DATABASE_URL` via the Docker Postgres container) is unaffected, and production/previews pick up `NETLIFY_DB_URL` automatically with nothing to configure in the Netlify UI.

Considered and rejected: a standalone Neon account, fully independent of Netlify. More portable in principle (Netlify DB is Neon underneath either way), but costs a second login/dashboard for a portability benefit that doesn't actually materialize on exit — the connection string Netlify hands back is a plain Postgres/Neon endpoint, so `pg_dump`/`pg_restore` to any other host works the same regardless of which path was taken. Not worth the extra account for this project's size.

Netlify's own migration system (`netlify database migrations ...`, auto-applied from `netlify/database/migrations` on every deploy) is **not** used here — it's opt-in and only activates for files in that specific directory. This project keeps Drizzle Kit exactly as described below, migrations committed under `src/drizzle/migrations/`, applied manually — no conflict, no rework.

### Blob storage (CV uploads)

**Netlify Blobs** — first-party object storage, available on all plans, no extra provisioning needed. Accessed via the `@netlify/blobs` SDK in Netlify Functions.

- Store each CV under a deterministic key, e.g. `cv/<application_id>` — keeps the key predictable for deletion
- Upload happens before the OAuth redirect (on the draft-save request), so the blob key can be stored on the draft row immediately
- Delete on: draft cleanup (1-day sweep), OAuth error path if draft abandoned, approve, reject
- No public URLs — blobs are served only through the admin detail view API route (authenticated), never exposed directly. The admin route fetches the blob and streams it to the client as `Content-Type: application/pdf`.
- **PDF security**: server-side validation on upload checks magic bytes (`%PDF-` prefix) — not just MIME type or file extension — before storing. The admin UI renders the PDF via **PDF.js** (embedded in the page) so the reviewer never downloads or opens it in a native PDF reader, eliminating the main attack surface for malicious PDFs.

### ORM & query layer

**Drizzle ORM** for queries; **Drizzle Kit** for migrations.

- Schema defined in TypeScript (`drizzle/schema.ts`)
- `drizzle-kit generate` produces versioned SQL migration files under `drizzle/migrations/` — committed to git, reviewed like any other code change
- Migrations applied manually before each schema-changing deploy: `npx drizzle-kit migrate` against `DATABASE_URL`
- **Caveat:** Drizzle Kit may not order `CREATE TYPE` statements before the `CREATE TABLE` that references them — verify generated migration files place enum creation above table creation, and hand-edit if not
- No query engine binary — Drizzle is a thin query builder over `pg`, which keeps Netlify Function cold starts fast

If richer relation querying becomes necessary later, migration to Prisma is low-friction (schema history stays intact; swap is mechanical query-call replacement, ~2–3h for this schema size).

### Migrations

One migration on first deploy (no `admin_users` table — admin identity is env-var-based).

#### `0001_create_applications`

```sql
CREATE TYPE application_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
CREATE TYPE mailchimp_sync_status AS ENUM ('synced', 'failed', 'deferred');
CREATE TYPE auth_provider AS ENUM ('linkedin', 'google', 'email'); -- 'email' = no OAuth, self-reported name/email only

CREATE TABLE applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Self-reported (from form, unverified)
  organisation          TEXT,
  linkedin_url          TEXT,         -- optional; strongly recommended
  cv_blob_key           TEXT,         -- Netlify Blobs key; null if no CV uploaded
  position_statement    TEXT,         -- free-text role/relevance; null if linkedin_url or cv provided
  comments              TEXT,         -- general comments field, always optional

  newsletter_opt_in     BOOLEAN NOT NULL DEFAULT false,

  -- OAuth-verified (null until callback completes)
  auth_provider         auth_provider NOT NULL,   -- set on draft creation, before OAuth
  name                  TEXT,
  email                 TEXT,
  picture_url           TEXT,
  provider_id           TEXT,         -- OAuth `sub` claim; null while status = draft

  -- Flow control
  state_token           TEXT,
  auth_error            TEXT,         -- provider error code if OAuth failed; cleared on retry
  status                application_status NOT NULL DEFAULT 'draft',

  -- Mailchimp sync outcome (null if newsletter_opt_in not checked, or approval not yet run)
  mailchimp_sync_status mailchimp_sync_status,

  -- Review
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           TEXT,         -- OAuth-verified email from admin session
  reviewer_notes        TEXT
);

-- Enforce provider_id uniqueness only among non-draft rows.
-- Drafts have NULL provider_id, so a plain unique constraint would block
-- multiple in-flight drafts; a partial index scopes it correctly.
-- Rows are deleted on approval or rejection, so only 'pending' remains.
CREATE UNIQUE INDEX applications_provider_id_pending_idx
  ON applications (provider_id)
  WHERE status = 'pending';
```

**Note**: this migration (and the schema/code today) still name the column and enum `mailchimp_sync_status` — that predates the Brevo decision (see Mailout Provider Comparison). Per the append-only migration philosophy already used elsewhere in this doc (see the `0004` note below), the rename to `newsletter_sync_status` happens as a **new** migration when the Phase 2 Brevo work lands, not a hand-edit of this one.

#### `0002_create_processed_applications`

```sql
CREATE TYPE processed_outcome AS ENUM ('approved', 'rejected');

CREATE TABLE processed_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash      TEXT NOT NULL UNIQUE,
  outcome         processed_outcome NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewer_notes  TEXT   -- populated for rejections only
);
```

Then add the FK column to `applications` (separate migration so it can reference the new table):

#### `0003_add_prior_rejection_fk`

```sql
ALTER TABLE applications
  ADD COLUMN prior_rejection_id UUID REFERENCES processed_applications(id);
```

#### `0004_create_newsletter_signups`

Phase 1 only — holding table for standalone newsletter signups until a provider is wired up. See Implementation Phasing.

```sql
CREATE TABLE newsletter_signups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced              BOOLEAN NOT NULL DEFAULT false,
  confirmation_token  TEXT,          -- standalone signups only; null once confirmed
  confirmed_at        TIMESTAMPTZ    -- set immediately for OAuth-verified approval opt-ins;
                                     -- set on confirm-link click for standalone signups
);
```

Added in a later migration, not part of the original `0004`: `confirmation_token`/`confirmed_at` — the real double opt-in mechanism described in User-Facing Flow → Newsletter only (a design refinement made after `0004` first shipped, not re-numbered here since the migration history is append-only).

No uniqueness constraint on `email` — a double-opt-in confirm/re-signup should overwrite intent, not error; dedupe at Phase 2 import time instead.

---

## API Dependencies

### LinkedIn OAuth

- App registered at [LinkedIn Developer Portal](https://developer.linkedin.com)
- Product: "Sign In with LinkedIn using OpenID Connect" — free, self-serve, request via app's Products tab
- Scopes: `openid profile email`
- Credentials stored as env vars: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Callback URL: `https://lawforaisafety.org/api/auth/linkedin/callback`
- `userinfo` endpoint returns: `sub`, `name`, `given_name`, `family_name`, `picture`, `locale`, `email`, `email_verified`. **No profile URL, no organisation/employer** — not available under this scope (full profile/positions API requires LinkedIn Marketing Developer Platform partnership, not viable here)
- LinkedIn's own docs note this flow confirms account control, not real-world identity — treat as a login/dedup signal, not identity verification

### Google OAuth

- App registered at [Google Cloud Console](https://console.cloud.google.com) — OAuth 2.0 client (Web application)
- Scopes: `openid profile email`
- Credentials stored as env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Callback URL: `https://lawforaisafety.org/api/auth/google/callback`
- `userinfo` endpoint (or JWT payload) returns: `sub`, `name`, `given_name`, `family_name`, `picture`, `email`, `email_verified`
- Same fields as LinkedIn OIDC — code paths for storing verified fields are shared. The `auth_provider` field on the application row distinguishes which was used.
- Google OAuth confirms Google account control only — same caveat as LinkedIn: login/dedup signal, not identity proof

### Transactional Email

Used for approval and rejection notifications to applicants, plus the Phase 1 newsletter confirm-link/courtesy emails (see Implementation Phasing). One-off triggered emails, distinct from Brevo's list/bulk-send side (see Mailout Provider Comparison) — but now the **same provider** for both, not a separate one.

**Superseded: was Resend, now Brevo.** The original call (see Questions for Stakeholder) was Resend, made before the mailout-provider decision existed. Once Brevo was picked for the mailing list (EU data residency, see below), consolidating transactional email onto it too was the natural follow-on: Brevo's transactional API is bundled into the same account/plan (no separate paid add-on, unlike Mailchimp/Mandrill — see Mailout Provider Comparison), so it's one fewer login/integration for a volume this low (a handful of emails/week). The usual reason to *keep* transactional and marketing email on separate providers — protecting transactional deliverability from bulk-send reputation damage — is a real pattern at scale, but not a meaningful risk at this project's volume.

- Env var: `BREVO_API_KEY` (same key covers both transactional sends and the mailout API — see Brevo below)
- Domain verification (SPF/DKIM records) needed for deliverability from `lawforaisafety.org` — one-time DNS setup in the Brevo dashboard
- **Applied in code** — `src/lib/email.ts` calls Brevo's `POST /v3/smtp/email` directly (`fetch`, no SDK dependency, matching the pattern already used for Turnstile verification). `resend` package removed. Sending is blocked until the sender/domain is verified in Brevo (see Brevo below) — DNS records for that go through Netlify's DNS API (nameservers already point there, no registrar access needed, see Database section for the same finding re: the DB work).

### Mailout Provider Comparison

Mailchimp was the provider originally assumed throughout this spec — since superseded by Brevo (see "Decided: Brevo" below). Kept here as the comparison baseline against the other realistic options, researched against current (2026) pricing pages and API docs. All five turn out to support both operations this feature needs — a double-opt-in signup path (`/api/newsletter`) and a direct subscribe-with-custom-fields path (approval flow, no double opt-in needed since OAuth already proved email control) — just in different shapes. None are ruled out on capability; the API column below notes the shape so the adapter code can be scoped correctly, not as a pass/fail filter. **Free tier size is the only hard differentiator**, since that's a cost/limit, not something code can adapt around.

| Provider | HQ / data location | Free tier | Cheapest paid tier | Double opt-in shape | Direct subscribe + custom fields shape |
|---|---|---|---|---|---|
| **Mailchimp** | 🇺🇸 US (Atlanta, GA) — Intuit-owned. Standard DPA/SCCs for EU customers, no EU data residency option | 250 contacts, 500 sends/mo (250/day) — cut down from 500/1,000 in Feb 2026 | Essentials $13/mo | `POST /lists/{id}/members` with `status: pending` — one endpoint, status flag picks the mode | Same endpoint, `status: subscribed` + `merge_fields` |
| **Brevo** (ex-Sendinblue) — **new pick, see below** | 🇪🇺 France (Paris) — data hosted on EU infra (OVH France/Germany, GCP Belgium), CNIL oversight, GDPR-native | 100,000 contacts, 300 emails/day | Starter $9/mo (5,000 emails) | Dedicated `POST /contacts/doubleOptinConfirmation` endpoint | `POST /contacts` with attributes — separate endpoint from DOI, not a status flag |
| **MailerLite** | 🇪🇺 Lithuania (Vilnius) — EU data centers, ISO 27001 certified, all sub-processors EU-based | 250 subscribers, 2,500 sends/mo — cut from 500/1,000 in Sept 2025 | Growing Business ~$10/mo | Account-wide toggle (Settings → Subscribe Settings) rather than a per-call parameter — running both opt-in styles side by side needs two groups (one DOI-on, one DOI-off) as a workaround | Custom fields on subscriber create, scoped to the single-opt-in group |
| **Kit** (ex-ConvertKit) | 🇺🇸 US | 10,000 subscribers, unlimited sends, full API — most generous free tier by far | Creator $33/mo (jumped from $15 in Sept 2025) | Property of the *form* a subscriber is added through (DOI on by default, "auto-confirm" toggle to bypass) — both opt-in styles means routing to two different forms instead of one param | Custom fields, capped at 140 field definitions |
| **Buttondown** | 🇺🇸 US | 100 subscribers | Basic $9/mo (1,000 subscribers) | Default behavior on subscriber create — new subscribers land in `unactivated` state and get a confirmation email automatically | Same create endpoint, pass `type: regular` to skip DOI per-subscriber; `metadata` object for custom fields like the LinkedIn URL |

**Decided: Brevo.** This is an EU-focused project, so EU data residency is a hard preference, not just a nice-to-have — that rules out Mailchimp, Kit, and Buttondown regardless of how well they otherwise fit. Between the two EU options, **Brevo over MailerLite**: per-call double-opt-in endpoint (matches the "same call, different flag" shape the flow needs more closely than MailerLite's account-wide toggle), unlimited contacts on every paid tier (best fit for a list that may grow unpredictably), cheaper entry pricing ($9/mo Starter vs MailerLite's ~$10/mo Growing Business, but Brevo's covers far more room before the next tier), and — the deciding factor once it came up — a bundled transactional email API, so it also replaces Resend for approval/rejection notices at no extra cost (see Transactional Email above), rather than running two providers for one low-volume app.

This section, the Transactional Email section above, and the rest of this spec (rewritten below) reflect that decision. Rest of this doc has been swept for consistency — the knock-on-effects list that used to sit here is resolved:
- **API Dependencies → Brevo** (was "Mailchimp"): rewritten below for Brevo's two-endpoint model
- **State Model**: `mailchimp_sync_status` → `newsletter_sync_status`, target name for the Phase 2 code refactor (see note under the `0001` migration — not yet renamed in code)
- **Abuse Protection**: Mailchimp-specific throttling citation removed (see below)
- Env vars: `MAILCHIMP_API_KEY`/`MAILCHIMP_LIST_ID` → `BREVO_API_KEY` + a list/folder ID (exact param TBD against Brevo's API when this is implemented)
- All other "Mailchimp" mentions throughout (User-Facing Flow, Admin UI, Route Structure) → Brevo

#### How pricing scales with list growth

Approximate monthly cost at list-size checkpoints, at the plan tier that gives us the automation/API features this spec needs (not the cheapest tier that merely stores the contacts). Sourced from vendor pricing pages and pricing-tracker sites (aggregator figures, not vendor calculators, where noted `~`) — **re-check official calculators before committing budget**, since these vendors revise tiers often (Mailchimp cut its free tier in Feb 2026, Kit hiked entry pricing 120% in Sept 2025, MailerLite cut its free tier in Sept 2025).

| Contacts | Mailchimp (Standard) | Brevo* | MailerLite (Growing Business) | Kit (Creator Pro) | Buttondown |
|---|---|---|---|---|---|
| 1,000 | ~$27/mo | $9/mo (Starter, 5k emails) | $15/mo | $79/mo | $9/mo (Basic) |
| 5,000 | ~$100/mo | $18/mo (Starter, 20k emails) | $39/mo | ~$139/mo | $29/mo (Standard) |
| 10,000 | $135/mo | $29/mo (Starter, 40k emails) | $73/mo | ~$189/mo | Not offered on a flat tier — Professional caps at 25k |
| 25,000 | ~$270/mo (interpolated, unverified) | $65/mo (Starter, 100k emails) | ~$109/mo | $279/mo | $79/mo (Professional) |
| 50,000 | ~$475/mo (interpolated, unverified) | ~$189/mo (Business tier, ~200k emails) | ~$340/mo (Advanced/Power) | ~$400–450/mo (unconfirmed) | Not offered — needs Enterprise/custom |

*Brevo prices by **monthly email volume**, not contact count, and contacts are unlimited on every paid tier. The figures above assume a weekly send cadence (~4 emails/contact/month) to make it comparable to the others — actual Brevo cost depends entirely on how often we email the list, not how big it is. A monthly-only newsletter would keep Brevo cheap even at 50k+ contacts; a daily one would push it into the Business tier much sooner.

**What this changes about the recommendation:** at the list sizes we'll actually hit in year one (low hundreds to low thousands), the gap between providers is small — MailerLite and Buttondown are cheapest at 1k, but neither fits the double-opt-in-alongside-direct-subscribe shape as cleanly as Mailchimp (see table above), so the savings would likely be eaten by adapter/workaround complexity. **Kit is the one to watch, but not for cost** — its list-price scaling is the steepest of the group (already $79/mo at 1,000 contacts, versus Mailchimp's free tier covering 250 and Essentials covering the next few thousand cheaply), so its earlier appeal (generous free tier) inverts once the list is big enough to need a paid plan at all. **Brevo is the one genuinely different shape**: because it charges for sends rather than list size, it's the best hedge against a large-but-quiet list (e.g. many subscribers, infrequent newsletter) — worth revisiting if list growth outpaces send frequency.

### Brevo

- Brevo Contacts + Transactional Email APIs (see Transactional Email above — same account/key covers both)
- Env vars: `BREVO_API_KEY`, plus a list/folder ID for the mailout side (exact param name TBD against Brevo's current API when implemented)
- Two mailout call sites, unlike Mailchimp's single endpoint-with-a-status-flag shape — Brevo splits double opt-in and direct subscribe into separate endpoints:
  - Newsletter-only path: `POST /contacts/doubleOptinConfirmation` on form submit — Brevo's own DOI flow, sends its own confirmation email
  - Work-with-us path: `POST /contacts` directly (no double opt-in needed — LinkedIn OAuth already proved control of the account/email, so a confirmation email would be redundant friction). Fired only on approval **and** only if `newsletter_opt_in` was checked. On failure, set `newsletter_sync_status = 'failed'` on the application row rather than letting the approval silently succeed with no subscription (see State Model)
  - **Phase 1 (no provider wired up yet)**: neither call site fires. See Implementation Phasing.
- Contact attributes can store LinkedIn URL for reference (work-with-us path only — newsletter-only signups have no LinkedIn data)
- **Abuse protection**: double opt-in (used on the newsletter-only path above) is the real mitigation regardless of provider — a maliciously-submitted address receives a confirmation email but is never added unless it's clicked. This protects Brevo's list, not `/api/newsletter` itself — that route needs its own protection, since the provider's protection only kicks in once a request reaches them. See Abuse Protection below. (Unlike the old Mailchimp version of this section, no specific claim is made here about Brevo's own anti-bot throttling behavior — not independently verified; the honeypot/timing/rate-limit/Turnstile stack below doesn't depend on it either way.)

### Abuse Protection (`/api/newsletter`, `/api/auth/linkedin`, `/api/auth/google`, `/api/auth/email`)

Three layers. The honeypot/timing pair are free and catch unsophisticated bots; Turnstile is the layer that stops a scripted bot written specifically against this site (the honeypot's known weakness, see caveat below, since this repo is public and the field name/CSS is readable source).

- **Cloudflare Turnstile** (primary layer against targeted bots): a managed challenge widget rendered on both forms (`TurnstileWidget.tsx`), verified server-side on every submit via Cloudflare's `siteverify` endpoint (`src/lib/turnstile.ts`) before any other processing runs. Free, no card required, no CAPTCHA-solving UX for most visitors (Cloudflare's managed mode only shows an interactive challenge when its own risk signals warrant it).
  - Client: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, safe to ship in the bundle). The widget auto-injects a hidden `cf-turnstile-response` input into its container once solved — no extra submit-handler wiring needed, it just rides along with the rest of the form fields.
  - Server: `TURNSTILE_SECRET_KEY` (secret). `verifyTurnstile(formData, ip)` posts the token + remote IP to Cloudflare and fails closed — missing token, network error, or a non-`success` response are all treated as unverified, never as a silent pass.
  - Unlike the honeypot, a Turnstile failure is a real, user-recoverable error (expired token, flaky network) — surfaced to the applicant as an actual error message ("We couldn't verify you're not a robot, please try again"), not silently masked. It sits ahead of the honeypot check in each route specifically so a failed challenge short-circuits before any DB/file work happens.
  - Local dev: use Cloudflare's fixed always-pass test keys (documented in `.env.example`) instead of a real site — no Cloudflare account needed to develop against this locally.
- **Honeypot field**: form includes an extra input invisible to humans (CSS-hidden, off-screen — not `type="hidden"`, since that's an obvious bot-skip pattern; a visually-hidden text input with a plausible name like `website` catches more bots). If it's non-empty on submit, silently drop the request — return the *same* success response as a real submission, don't do the actual Brevo/DB write. Never tell the caller it was flagged; that just teaches the bot to adapt.
  - **Caveat**: this repo may be public, so the field name/CSS is readable source, not a secret. A generic scraper bot that blindly fills every form field (most spam traffic) still gets caught. A bot specifically written against this site's source won't be — that's the gap Turnstile above closes, since it isn't defeated by reading the source.
  - **Timing check** (cheap, works even with public source): reject submissions faster than a plausible human fill time (e.g. under ~2 seconds from page load to submit, tracked via a timestamp hidden field or the honeypot's own render time). Behavioral, not secret-based — a bot can read the threshold in the source but still has to actually wait, which most scripted bots skip.
- **Rate limiting**: Netlify Functions support code-based rate limiting — a `config` object exported directly from the function file (no `netlify.toml` entry needed, works on all plans). Apply to both `/api/newsletter` and `/api/auth/linkedin` (the draft-creation step), keyed by IP, generous enough not to block a real user retrying (e.g. a handful of requests per minute) but enough to blunt a scripted flood. ([source](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/))
- All three layers apply to `/api/auth/linkedin`, `/api/auth/google` (draft creation), and `/api/auth/email` (the no-verification fallback) exactly as to `/api/newsletter` — all are unauthenticated, form-triggered writes reachable before any identity is established.

### Slack

Two separate uses of the Slack API here: notifying the reviewer of new submissions, and inviting an approved applicant to the workspace. Different mechanisms, different effort levels.

#### Reviewer notification — incoming webhook

- Slack app → Features → Incoming Webhooks → add to a channel (e.g. `#admin-review`)
- No OAuth scope needed, just a webhook URL — store as `SLACK_WEBHOOK_URL` env var (treat as a secret; anyone with the URL can post to the channel)
- On new submission: `POST` a JSON payload (applicant name, org, direct link to `/admin/applications/[id]`) to the webhook URL — link only, not interactive approve/reject buttons (see below)
- Available on all plans, including Free — no Enterprise Grid requirement, unlike invite automation below

**Considered and rejected: Slack-native interactive approve/reject buttons** (Block Kit + Interactivity). Would need a new signed-request endpoint (`SLACK_SIGNING_SECRET`), `chat:write` scope, and message updates after action — real extra infra. More importantly, it undermines the review itself: the core check is comparing the OAuth-verified photo/name against the linked LinkedIn profile side by side (see Manual Review), which a Slack button can't show. A reviewer would have to open the admin panel to actually check anyway, making the button redundant. Link-only is both simpler and enforces the check actually happens.

#### Workspace invite (on approval)

Two implementations depending on plan tier. **Correction to earlier assumption**: automated invite-by-API requires **Enterprise Grid**, not just any paid plan — Pro/Business+ doesn't unlock it.

##### Option A — Enterprise Grid (fully automated)

- Requires an org-level Slack app (lives at the Enterprise Grid org, not a single workspace) with `admin.users:write` scope
- Org admin must approve/install the app
- On approval: `POST admin.users.invite` with `team_id`, applicant `email`, at least one `channel_ids` entry, optional welcome message
- Env vars: `SLACK_ORG_ADMIN_TOKEN`
- Docs: [admin.users.invite](https://docs.slack.dev/reference/methods/admin.users.invite/)
- **Given this org almost certainly isn't on Enterprise Grid, plan for Option B by default.**

##### Option B — Standard workspace (Free, Pro, or Business+) — manual admin invite (recommended)

No public API invites a user by email on these tiers. **Recommended: manual admin action** — given approval is already a manual human step, adding the Slack invite to that same step is minimal extra effort and avoids the exposure risk of a standing shared link.

- On approval, the admin interface shows a single **"Invite to Slack"** button that does two things at once: copies the applicant's email to the clipboard and opens `https://{workspace}.slack.com/admin/invites` in a new tab. The reviewer pastes and sends — no manual navigation needed. Workspace URL stored as env var `SLACK_WORKSPACE_URL`.
- **Duplicate-check before inviting**: standard [`users.list`](https://docs.slack.dev/reference/methods/users.list/) Web API method (not the Enterprise-only `admin.*` namespace) is available on all plans, including Free, via a bot token. [Scopes](https://api.slack.com/scopes): `users:read` (+ `users:read.email` to match on email). Use this to check if the applicant's email is already a workspace member before inviting — avoids duplicate invites for people who joined some other way, and can auto-skip that step in the admin UI if already present.
- Env vars: `SLACK_BOT_TOKEN` (bot token, `users:read` + `users:read.email` scopes — read-only, no invite capability needed)

---

## Implementation Phasing

Mailout provider is decided (Brevo, see Mailout Provider Comparison) but not yet wired up in code. Rest of the feature doesn't depend on that wiring, so it's still built in two phases.

### Phase 1 — build now, provider-agnostic

Everything except the two newsletter-provider call sites:

- Full apply flow: form, LinkedIn/Google OAuth (both applicant and admin), draft/pending/approved/rejected state machine, resubmission + reapplication logic
- Admin UI: login, list view, detail view, approve/reject, CV upload + PDF.js viewer, Slack reviewer notification + manual "Invite to Slack" step
- Transactional emails (approval/rejection) — Brevo transactional API (see Transactional Email above)
- Full DB schema (migrations `0001`–`0004`), abuse protection (honeypot, timing check, rate limiting, Cloudflare Turnstile)

Two call sites are stubbed instead of wired to a real provider:

1. **`/api/newsletter`** (standalone signup) — instead of `POST`ing to the provider, insert into the new `newsletter_signups` holding table (migration `0004`, see Migrations) with a `confirmation_token` and send a **real double opt-in confirm-link** via Brevo's transactional API (see Transactional Email above; see also User-Facing Flow → Newsletter only). Same honeypot/rate-limit protection applies. `confirmed_at` stays null until the link is clicked via `/api/newsletter/confirm`.
2. **Approval-time subscribe** (`newsletter_opt_in` on an application) — skip the provider call, and set `newsletter_sync_status = 'deferred'` for visibility in the approve response/logs. **Important**: the application row and its `email` field are deleted immediately after the decision (see State Model / Admin UI) — a status flag on a row that's about to be deleted can't be retried later, the email would already be gone. So the approve route must also **insert the applicant's email into `newsletter_signups`** (the same holding table as the standalone path, point 1) *before* the PII purge step. That insert, not the status flag, is what actually survives for Phase 2 backfill. Unlike the standalone path, this insert sets `confirmed_at` immediately (no token) — the email is already OAuth-verified, so a second click-to-confirm would be redundant friction (same reasoning the spec applies to skipping Brevo's own DOI on this path). The approve route also sends the applicant the **second, separate** newsletter courtesy notice via the transactional provider at this point (no confirm link, since already confirmed) — distinct send from the approval email in step 9, both fired from the same approve request.

### Phase 2 — wire up Brevo

- Implement the real Brevo Contacts calls in both stubbed sites above (see API Dependencies → Brevo for the two-endpoint model) — `src/lib/email.ts`'s transactional side is already done (see Transactional Email above), this is just the mailing-list half
- **Backfill `newsletter_signups`**: bulk-import rows **where `confirmed_at IS NOT NULL`** into Brevo — this single table now covers both standalone newsletter-only signups (confirmed via the Phase 1 click-through) and approved applicants who opted in during Phase 1 (confirmed immediately, OAuth-verified), since both funnel into it before purge. Unconfirmed standalone rows just don't get imported — they were never verified, same as if Brevo's own DOI had never been clicked. Brevo's `doubleOptinConfirmation` endpoint can be called per row on import, though it's redundant given ours already confirmed — a plain contact-create call is simpler. Dedupe by email before import — no uniqueness constraint on the holding table. Once imported, either drop the table or leave it as an audit trail.
- Remove the Phase 1 stub branches and the `newsletter_signups` table (and the now-unused `deferred` enum value, kept only for in-flight visibility during Phase 1) once nothing references them

---

## Route Structure (Next.js App Router)

```
/app
  page.tsx                 — Homepage; the newsletter + apply forms live inline in the
                              #contact section (not a standalone /apply page)
  /apply/success
    page.tsx              — Confirmation screen (application path)
  /apply/retry
    page.tsx              — OAuth-error retry landing (mint fresh state_token, switch provider)
  /admin/login
    page.tsx              — "Log in with LinkedIn" button (admin OAuth entry point)
  /admin
    page.tsx              — List pending applications (protected)
  /admin/applications/[id]
    page.tsx              — Review one application: profile, org, CV, approve/reject (protected)
  /api
    /newsletter
      route.ts            — Newsletter-only signup, POSTs to Brevo directly (Phase 2) /
                              inserts into newsletter_signups + sends confirm-link email (Phase 1)
    /newsletter/confirm
      route.ts            — Double opt-in confirm-link target (Phase 1's own DOI mechanism)
    /auth/linkedin
      route.ts            — Initiate LinkedIn OAuth (applicant flow)
    /auth/linkedin/callback
      route.ts            — Handle LinkedIn OAuth callback, store application
    /auth/google
      route.ts            — Initiate Google OAuth (applicant flow)
    /auth/google/callback
      route.ts            — Handle Google OAuth callback, store application
    /auth/email
      route.ts            — No-OAuth fallback: submit application from a bare name + email,
                              straight to status = pending (no draft/redirect round trip)
    /auth/retry
      route.ts            — Retry a draft stuck in auth_error with a fresh state_token
    /admin/auth/linkedin
      route.ts            — Initiate admin LinkedIn OAuth (separate from applicant flow)
    /admin/auth/linkedin/callback
      route.ts            — Handle admin OAuth callback; check ADMIN_EMAILS whitelist; issue session cookie
    /admin/logout
      route.ts            — Clear session cookie
    /admin/applications
      route.ts            — List/fetch applications for the admin UI (protected)
    /admin/applications/[id]/cv
      route.ts            — Stream CV blob to admin client (authenticated; used by PDF.js viewer)
    /admin/approve/[id]
      route.ts            — Approve application, sets reviewed_by, deletes CV blob (protected)
    /admin/reject/[id]
      route.ts            — Reject application, sets reviewed_by, deletes CV blob (protected)
```

`/admin/*` pages and `/api/admin/*` routes (other than `/admin/auth/*`) are protected by the session cookie set at login — see Admin UI → Authentication. Env vars: `SESSION_SECRET` (signs/verifies the session cookie), `ADMIN_EMAILS` (comma-separated whitelist of permitted LinkedIn emails), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (Cloudflare Turnstile — see Abuse Protection).

---

## Open Questions

- **Volume**: For now, resolved — oldest-first plain list (see Admin UI) holds up fine given lightweight rows and up to 3–4 reviewers. Revisit (pagination, claiming, bulk actions) only if actual volume becomes a demonstrated problem, not pre-emptively.

---

## Questions for Stakeholder

- **Slack plan**: ~~Confirm~~ **Resolved** — no move to paid/Enterprise Grid planned. Building Option B (manual admin invite) as the permanent design, not a stopgap.
- **Rejection email**: ~~Confirm~~ **Resolved** — send a polite rejection email. Build this (see User-Facing Flow step 8, Layman's Explanation).
- **Google Workspace SMTP**: ~~Confirm~~ **Resolved** — no Google Workspace account. Originally decided on **Resend**; **superseded** by consolidating onto **Brevo** once it was picked as the mailout provider (see Mailout Provider Comparison and Transactional Email). `src/lib/email.ts` now on Brevo — sending itself is still blocked until the Brevo sender/domain verification completes (see Brevo).
- **Privacy policy / data retention**: All applicant PII is purged immediately on decision (approved or rejected), including any uploaded CV. Only a peppered email hash is retained in `processed_applications`, with reviewer notes for rejections. Still need: a privacy notice on the form before launch (covering CV upload in particular), and a right-to-erasure process for the `processed_applications` hash record if a user requests deletion. These are stakeholder calls — flagging so they aren't missed.
