# Opportunities ingestion API

`/api/admin/opportunities` manages the board's listings: jobs, fellowships, projects, courses and events. It's used by the admin UI (`/admin/opportunities`, session cookie), and also accepts a bearer-token key so an automated agent or script can create and update listings without a browser session. Code: `src/app/api/admin/opportunities/route.ts`, `src/app/api/admin/opportunities/[slug]/route.ts`, `src/lib/admin-guard.ts` (`requireOpportunitiesOrApiKey`).

## Authentication

Set `OPPORTUNITIES_API_KEY` (see `.env.example`; generate with `openssl rand -hex 32`). Restart the server after changing it — it's read once at startup via `.env.local`/the host's env config, not re-read per request.

Every request needs:

```
Authorization: Bearer <OPPORTUNITIES_API_KEY>
```

The comparison is constant-time (`src/lib/timing-safe-equal.ts`). With no key configured, the bearer path always fails closed and only an admin session works. Writes made with the key are attributed in the audit log to `ingestion@api` / "Automated ingestion", so they're distinguishable from a human editor's.

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/api/admin/opportunities` | Every listing. Check this before creating, to avoid duplicates. |
| `POST` | `/api/admin/opportunities` | Creates a listing, live immediately. Slug is computed server-side from `org` and `title`; don't send `id`, `slug`, or `publishedAt`. |
| `GET` | `/api/admin/opportunities/<slug>` | One listing. 404 if it doesn't exist. |
| `PATCH` | `/api/admin/opportunities/<slug>` | Updates a listing. Send every field you want kept — an omitted optional field is cleared, not left as-is. |
| `DELETE` | `/api/admin/opportunities/<slug>` | Removes a listing. |

A `POST`/`PATCH` body that fails validation gets `400` with a human-readable `error`; fix the field it names rather than retrying unchanged.

## Fields

From `src/opportunities/schema.ts`:

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"job" \| "fellowship" \| "project" \| "course" \| "event"` | |
| `title` | string, ≤200 | |
| `org` | string, ≤200 | |
| `orgUrl` | URL | optional |
| `summary` | string, ≤500 | |
| `description` | string | |
| `locationCountry` | ISO country code, or `"GLOBAL"` | `GLOBAL` is for roles with no single base country |
| `locationCity` | string, ≤100 | optional; omit when `locationCountry` is `GLOBAL` |
| `locationNote` | string, ≤200 | optional |
| `remote` | boolean | |
| `commitment` | `"full_time" \| "part_time" \| "contract" \| "internship" \| "fellowship"` | optional |
| `compMin`, `compMax` | number ≥ 0 | optional; `compMax` ≥ `compMin` |
| `compCurrency` | `"GBP" \| "USD" \| "EUR"` | required if `compMin`/`compMax` is set |
| `compPeriod` | `"year" \| "month" \| "week" \| "day" \| "hour"` | required if `compMin`/`compMax` is set |
| `compNote` | string, ≤200 | optional |
| `deadline`, `startDate`, `endDate` | `YYYY-MM-DD` | optional; for an `event`, `startDate` is its date and `endDate` its last day if it runs over several. An event with no `deadline` closes once that day has passed |
| `tags` | string[], each ≤50 | optional |
| `applyUrl` | URL | required |
| `applyLabel` | string, ≤50 | optional |
| `sourceUrl` | URL | optional; where the listing was found, use it to dedupe on re-ingestion |
| `submissionId` | uuid | `POST` only, optional; publishes an outside submission (`/admin/opportunities/submissions`) as this listing and emails its submitter. 409 if it isn't pending |

## Prompting an ingestion agent

Point it at this file, or give it the equivalent directly: base URL, the bearer header, the field table above, and an explicit instruction to `GET /api/admin/opportunities` first and match on `sourceUrl` before creating, `PATCH`-ing an existing match instead of creating a duplicate.
