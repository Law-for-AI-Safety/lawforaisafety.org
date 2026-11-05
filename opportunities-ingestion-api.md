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
| `GET` | `/api/admin/opportunities` | Every listing, drafts included, each with its `status`. Check this before creating, to avoid duplicates. |
| `POST` | `/api/admin/opportunities` | Creates a listing: live immediately, or a draft with `"status": "draft"`. Slug is computed server-side from `org` and `title`; don't send `id`, `slug`, or `publishedAt`. |
| `GET` | `/api/admin/opportunities/<slug>` | One listing, draft or published. 404 if it doesn't exist. |
| `PATCH` | `/api/admin/opportunities/<slug>` | Updates a listing. Send every field you want kept — an omitted optional field is cleared, not left as-is. `{"status": "published"}` on its own publishes a draft without editing it. |
| `DELETE` | `/api/admin/opportunities/<slug>` | Removes a listing. |

## Drafts

To post a batch for an admin to review, create each listing with `"status": "draft"` alongside its fields:

```
POST /api/admin/opportunities
{ "status": "draft", "type": "job", "title": "...", "org": "...", ... }
```

A draft is never public: it isn't on the board, its `/opportunities/<slug>` page is a 404, and it isn't in the sitemap. Its slug is fixed when it's created, so it keeps the same address once published. It has no `publishedAt` until it's published, which dates it that day. Admins see drafts at `/admin/opportunities`, preview each at `/admin/opportunity-preview/<slug>`, and publish from its edit page; a script can publish one with `PATCH /api/admin/opportunities/<slug>` and `{"status": "published"}`. A published listing can't be made a draft again. `status` left out of a `POST` means `"published"`.

A `POST`/`PATCH` body that fails validation gets `400` with a human-readable `error`; fix the field it names rather than retrying unchanged.

## Fields

From `src/opportunities/schema.ts`:

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"job" \| "fellowship" \| "project" \| "course" \| "event"` | required, exactly one of these in lower case; anything else, or no `type`, is a `400`. See [Choosing a type](#choosing-a-type) |
| `title` | string, ≤200 | required |
| `org` | string, ≤200 | required |
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
| `deadline`, `startDate`, `endDate` | `YYYY-MM-DD` | optional, except that an `event` needs `startDate`, its date; `endDate` is its last day if it runs over several. `endDate` can't be before `startDate`. With no `deadline`, an event closes once its last day has passed and a course on its start date; anything else never closes. Leave all three out when sending `rounds` |
| `rounds` | list of rounds, ≤20 | optional, for a listing that runs more than once (a course's cohorts, say). See [Rounds](#rounds) |
| `tags` | string[], each ≤50 | optional |
| `applyUrl` | URL | required |
| `applyLabel` | string, ≤50 | optional |
| `sourceUrl` | URL | optional; where the listing was found, use it to dedupe on re-ingestion |
| `status` | `"draft" \| "published"` | optional, default `"published"`. See [Drafts](#drafts) |
| `submissionId` | uuid | `POST` only, optional; publishes an outside submission (`/admin/opportunities/submissions`) as this listing and emails its submitter. 409 if it isn't pending. Can't be combined with `"status": "draft"` (400), since the submitter's email links to the public listing |

### Rounds

A listing that runs several times, each with its own dates, sends them as `rounds` instead of its own `deadline`/`startDate`/`endDate`, which must then be left out (sending both is a `400`):

```json
"rounds": [
  { "label": "Round 1", "deadline": "2026-11-15", "startDate": "2026-11-23", "endDate": "2027-01-02" },
  { "label": "Round 2", "deadline": "2026-12-06" }
]
```

- Each round takes only `label` (string, ≤50, e.g. `"Intensive"` or `"Part-time"`), `deadline`, `startDate` and `endDate` (`YYYY-MM-DD`). Every one is optional, but a round needs at least one date, and its `endDate` can't be before its `startDate`. An `event`'s every round needs its `startDate`.
- Any other key in a round, or a value that isn't a string, is a `400`. Errors name the round, counting from 1: `Round 2: End date can't be before the start date`.
- A round closes the way a listing does (its `deadline`; with none, an event's last day or a course's start date). The board shows the open round that closes soonest, and the listing closes after its last round.
- Rounds are saved in the order they close, soonest first (a round that never closes goes last, ties as sent), so `GET` returns them in that order, each with its fields in the order above and unset ones left out. A listing with single dates has no `rounds` key.
- `rounds` left out, `null` or `[]` means none. Like every field, a `PATCH` that leaves it out clears it, turning the listing back into one with single dates.

### Choosing a type

There is no default: a listing without a valid `type` is refused rather than filed under the wrong tab. Each type sets the listing's tab, badge, button and date labels (`src/opportunities/kinds.ts`).

| `type` | For | Button | Dates |
| --- | --- | --- | --- |
| `job` | a paid role, permanent or fixed-term | Apply now | `deadline` to apply; `startDate`/`endDate` of the role |
| `fellowship` | a fellowship, residency or paid research programme with a cohort | Apply now | `deadline` to apply; `startDate`/`endDate` of the programme |
| `project` | volunteering or a collaboration to join, unpaid or ad hoc | Get involved | `deadline` to apply; `startDate`/`endDate` of the project |
| `course` | a course or training programme | View course | `deadline` to enrol; `startDate`/`endDate` of the course. With no `deadline` it closes on its `startDate`. A course with several cohorts sends [`rounds`](#rounds) |
| `event` | a conference, workshop, talk or other dated event | Register | `startDate` (required) is its date; `deadline` to register, if any |

## Prompting an ingestion agent

Point it at this file, or give it the equivalent directly: base URL, the bearer header, the field table above, and explicit instructions to:

- `GET /api/admin/opportunities` first and match on `sourceUrl` before creating, `PATCH`-ing an existing match instead of creating a duplicate.
- Always send `type`, chosen with the table in [Choosing a type](#choosing-a-type), and skip a listing it can't place rather than guessing.
- On a `400`, read `error` and fix the field it names before retrying.
