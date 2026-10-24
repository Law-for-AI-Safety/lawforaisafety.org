import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  check,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  jsonb,
  index,
  integer,
  primaryKey,
  date,
} from "drizzle-orm/pg-core";

export const applicationStatus = pgEnum("application_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
]);

export const mailchimpSyncStatus = pgEnum("mailchimp_sync_status", [
  "synced",
  "failed",
  "deferred",
]);

// Approval/rejection notification email outcome. A row stays present (not
// purged) with status = approved/rejected + notificationStatus = 'failed'
// until a retry succeeds — see admin-flow.ts. 'sent' is transient: the row
// is deleted immediately after, so it's rarely observed at rest.
export const notificationStatus = pgEnum("notification_status", [
  "sent",
  "failed",
]);

// "email" = no OAuth at all — applicant just typed a name + email. Weakest
// possible signal, no identity proof behind it. See Manual Review / Admin UI.
export const authProvider = pgEnum("auth_provider", [
  "linkedin",
  "google",
  "email",
]);

export const processedOutcome = pgEnum("processed_outcome", [
  "approved",
  "rejected",
]);

// Which public page the applicant used — the general "Work with us" form on
// the homepage, or one of the workstream pages that embeds the same form.
// Purely a tag for admin triage; it doesn't change validation or the flow.
export const applicationSource = pgEnum("application_source", [
  "homepage",
  "mep_outreach",
  "council_of_europe",
  "field_building",
  "foi",
]);

// Who is applying, as opposed to why (which is the page, see application-pages.ts).
export const applicationAudience = pgEnum("application_audience", [
  "individual",
  "organisation",
]);

export const redLinesArea = pgEnum("red_lines_area", [
  "legal_governance",
  "technical",
]);

export const redLinesEuInterest = pgEnum("red_lines_eu_interest", [
  "yes",
  "maybe",
  "no",
]);

export const processedApplications = pgTable("processed_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailHash: text("email_hash").notNull().unique(),
  outcome: processedOutcome("outcome").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewerNotes: text("reviewer_notes"),
});

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Self-reported (from form, unverified)
    organisation: text("organisation"),
    linkedinUrl: text("linkedin_url"),
    cvBlobKey: text("cv_blob_key"),
    positionStatement: text("position_statement"),
    comments: text("comments"),

    newsletterOptIn: boolean("newsletter_opt_in").notNull().default(false),
    source: applicationSource("source").notNull().default("homepage"),
    audience: applicationAudience("audience").notNull().default("individual"),

    // OAuth-verified (null until callback completes)
    authProvider: authProvider("auth_provider").notNull(),
    name: text("name"),
    email: text("email"),
    pictureUrl: text("picture_url"),
    providerId: text("provider_id"),

    // Flow control
    stateToken: text("state_token"),
    authError: text("auth_error"),
    status: applicationStatus("status").notNull().default("draft"),

    // Mailchimp/Brevo sync outcome (null if newsletter_opt_in not checked, or approval not yet run)
    mailchimpSyncStatus: mailchimpSyncStatus("mailchimp_sync_status"),

    // Review
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewerNotes: text("reviewer_notes"),

    // Set when a decision (approve/reject) is made; 'failed' means the
    // applicant hasn't been notified yet — row is kept around (not purged)
    // so the admin can retry. Null while status = pending/draft.
    notificationStatus: notificationStatus("notification_status"),

    priorRejectionId: uuid("prior_rejection_id").references(
      () => processedApplications.id,
    ),
  },
  (table) => [
    uniqueIndex("applications_provider_id_pending_idx")
      .on(table.providerId)
      .where(sql`${table.status} = 'pending'`),
    // Every application says something about itself: a LinkedIn profile, a CV, or a statement.
    check(
      "applications_has_credential_chk",
      sql`${table.linkedinUrl} IS NOT NULL OR ${table.cvBlobKey} IS NOT NULL OR ${table.positionStatement} IS NOT NULL`,
    ),
    // An organisation applying must name the organisation.
    check(
      "applications_organisation_name_chk",
      sql`${table.audience} <> 'organisation' OR (${table.organisation} IS NOT NULL AND ${table.organisation} <> '')`,
    ),
  ],
);

// Red Lines Dialogues expert applications. Unlike `applications`, decided
// rows are never purged — approved rows are the working group's actual
// contact list (area of expertise, affiliation, meeting availability), and
// rejected rows are deliberately kept as "who we didn't invite", per policy.
// Only an erasure request (see erasure.ts) deletes a row here. That also
// means there's no processed_applications-style hash table for this flow:
// "already applied" is answered directly from provider_id, since the record
// that answers it is never gone.
export const redLinesApplications = pgTable("red_lines_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // Self-reported (from form, collected before identity is confirmed)
  areaOfExpertise: redLinesArea("area_of_expertise"),
  motivation: text("motivation"),
  availableHours: integer("available_hours"),
  availableOct12: boolean("available_oct_12").notNull().default(false),
  availableNov9: boolean("available_nov_9").notNull().default(false),
  availableDec7: boolean("available_dec_7").notNull().default(false),
  availableJan11: boolean("available_jan_11").notNull().default(false),
  euParliamentInterest: redLinesEuInterest("eu_parliament_interest"),
  affiliation: text("affiliation"),
  publicationExample: text("publication_example"),
  // Self-reported, optional, and independent of `authProvider` — someone can
  // verify with LinkedIn OAuth and still not want to share the URL here, or
  // verify by name/email and paste it in as a supporting credential.
  linkedinUrl: text("linkedin_url"),

  // "email" means no OAuth: applicant typed a name + email and confirmed it
  // via an emailed link — the weakest identity signal, flagged as such in
  // the admin UI. See applications.authProvider for the fuller version of
  // this note; this table only ever uses "linkedin" or "email".
  authProvider: authProvider("auth_provider").notNull().default("linkedin"),
  // Name/email: OAuth-verified on the LinkedIn path (from the provider,
  // confirmed at the callback), self-reported on the email path (typed by
  // the applicant, only proven to the extent they could click the
  // confirmation link sent to that address).
  name: text("name"),
  email: text("email"),
  pictureUrl: text("picture_url"),
  // Stable identity key: the LinkedIn `sub` on that path, the normalised
  // email address on the email path (mirrors applications.providerId).
  providerId: text("provider_id").unique(),

  // Flow control
  stateToken: text("state_token"),
  authError: text("auth_error"),
  status: applicationStatus("status").notNull().default("draft"),

  // Review — kept alongside the row itself rather than purged elsewhere, see
  // the note above.
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  reviewerNotes: text("reviewer_notes"),

  // Decisions here aren't followed by an automatic email (see
  // red-lines-admin-flow.ts) — the working group contacts applicants by
  // hand, and marks it here so the admin list can show who still needs
  // reaching out to.
  contactedBy: text("contacted_by"),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
});

// Runtime feature flags, toggled from the admin panel. A missing row reads as
// off, so a flag only turns on by an explicit admin action.
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const newsletterSignups = pgTable("newsletter_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  synced: boolean("synced").notNull().default(false),
  // Standalone `/api/newsletter` signups need a real double opt-in click —
  // null once confirmed. Approval-time opt-ins skip this (already OAuth-verified)
  // and are inserted with confirmedAt set immediately.
  confirmationToken: text("confirmation_token"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const adminAuditAction = pgEnum("admin_audit_action", [
  "login",
  "approve",
  "reject",
  "erase",
  "signup_toggle",
  "red_lines_toggle",
  "cms_role_change",
  "cms_draft_save",
  "cms_draft_discard",
  "cms_publish",
  "cms_withdraw",
  "cms_publish_outcome",
  "sessions_end",
]);

// Append-only record of who did what in the admin panel. The application row
// (and its reviewed_by) is deleted once a decision is notified, so without
// this there is no way to tell afterwards who approved whom. The subject is
// the same peppered HMAC as processed_applications.email_hash — no new PII —
// and is nulled by the erasure tool along with the processed record. Erasures
// themselves are logged without a subject at all.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorEmail: text("actor_email").notNull(),
    action: adminAuditAction("action").notNull(),
    subjectEmailHash: text("subject_email_hash"),
    detail: jsonb("detail"),
  },
  (table) => [
    index("admin_audit_log_subject_idx").on(table.subjectEmailHash),
  ],
);

// Fixed-window request counters for the public form endpoints — shared across
// function instances, which an in-memory counter isn't. `key` is a bucket name
// plus a keyed hash of the client IP, never the address itself; rows are swept
// an hour after their window opens (see src/lib/rate-limit.ts).
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limit_hits_window_start_idx").on(table.windowStart),
  ],
);

// Shared by taskTrackerProjects and taskTrackerTasks. Reason for "blocked" lives in a
// separate nullable column, not folded into the enum — same reason
// applicationStatus keeps reviewerNotes separate.
export const taskTrackerStatus = pgEnum("task_tracker_status", [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);

/**
 * Names for the people who use the admin panel, so the tracker can offer
 * "Ada Lovelace" instead of asking someone to type an email exactly. Filled
 * in from the OAuth profile each time someone logs in — it holds no more
 * than the login already puts in the session cookie, and assignments are
 * still stored as the email (the stable identifier), never as a name.
 */
// One row per admin sign-in. The browser holds a random token in the admin_session cookie; only
// its SHA-256 is stored, so a copy of this table or a backup holds no session that works. A
// session is good until `expiresAt`, unless `endedAt` is set: by logging out, or by a technical
// admin ending that person's sessions.
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: text("ended_by"),
  },
  (table) => [index("admin_sessions_email_idx").on(table.email)],
);

export const adminPeople = pgTable("admin_people", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const taskTrackerProjects = pgTable("task_tracker_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  ownerEmail: text("owner_email"),
  status: taskTrackerStatus("status").notNull().default("draft"),
  plannedStart: date("planned_start"),
  plannedEnd: date("planned_end"),
  actualStart: date("actual_start"),
  actualEnd: date("actual_end"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const taskTrackerTasks = pgTable("task_tracker_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => taskTrackerProjects.id),
  name: text("name").notNull(),
  description: text("description"),
  // Freeform list of URLs, added as needed — no fixed shape to justify a
  // separate table yet.
  resourceLinks: jsonb("resource_links").$type<string[]>().default([]),
  assigneeEmail: text("assignee_email"),
  status: taskTrackerStatus("status").notNull().default("draft"),
  blockedReason: text("blocked_reason"),
  plannedStart: date("planned_start"),
  plannedEnd: date("planned_end"),
  actualStart: date("actual_start"),
  actualEnd: date("actual_end"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: text("created_by").notNull(),
});

// A task can depend on several others; "still blocked by a dependency" is
// computed at read time from this table (join to taskTrackerTasks, filter status
// not in 'done'/'cancelled') rather than stored, so it can't go stale.
export const taskTrackerTaskDependencies = pgTable(
  "task_tracker_task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskTrackerTasks.id),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => taskTrackerTasks.id),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index("task_tracker_task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
  ],
);

// Separate from adminAuditLog: that table's subjectEmailHash exists
// specifically for the applicant-erasure/privacy workflow, which doesn't
// apply to internal project tracking.
export const taskTrackerAuditLog = pgTable("task_tracker_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  detail: jsonb("detail"),
});

// CMS editing state. Published content lives in the repo's content/ files; the database holds
// only drafts, who may edit, and a log of what was sent for publishing (see src/cms/).

export const cmsPermission = pgEnum("cms_permission", ["draft", "publish"]);

// One row per person with CMS access. No row means no access; technical admins
// (TECH_ADMIN_EMAILS) have every permission without one. Emails are stored lower-cased.
export const cmsRoles = pgTable("cms_roles", {
  email: text("email").primaryKey(),
  permission: cmsPermission("permission").notNull(),
  grantedBy: text("granted_by").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

// One shared draft per page. `version` goes up on every save, and a save names the version it
// started from, so a save made from a stale copy is refused instead of overwriting another
// editor's work. `baseHash` is the git blob id of the content file the draft started from.
// `valid` says whether the draft passed the page schema when it was saved. `lockedAt` is set
// while the draft is sent for publishing (from just before its pull request is opened until it
// is merged and deployed, closed, or withdrawn); a locked draft refuses saves, discards and
// publishes.
export const cmsDrafts = pgTable("cms_drafts", {
  page: text("page").primaryKey(),
  content: jsonb("content").notNull(),
  baseHash: text("base_hash").notNull(),
  valid: boolean("valid").notNull(),
  version: integer("version").notNull().default(1),
  authorEmail: text("author_email").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
});

export const cmsSubmissionState = pgEnum("cms_submission_state", [
  "pending",
  "failed",
  "open",
  "merged",
  "closed",
  "withdrawn",
]);

// Each time a page was sent for publishing: the pull request it opened and what became of it.
// A row is written as `pending` before GitHub is touched, gets its `branch` before the pull
// request is opened and its `prNumber` once it is (state `open`), or ends `failed`, so no pull
// request exists that no row points to. `baseHash` is the blob id of the file on main it replaced and `draftVersion` the draft
// version it sent. Once merged, `mergedHash` is the file's blob id in the merge commit; once
// closed without merging, `closingNote` is the reviewer's last comment. `resolvedAt` is when it
// was merged, closed or withdrawn.
export const cmsSubmissions = pgTable(
  "cms_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    page: text("page").notNull(),
    prNumber: integer("pr_number"),
    branch: text("branch"),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    state: cmsSubmissionState("state").notNull().default("open"),
    baseHash: text("base_hash"),
    draftVersion: integer("draft_version"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    mergedHash: text("merged_hash"),
    closingNote: text("closing_note"),
    closingNoteBy: text("closing_note_by"),
  },
  (table) => [index("cms_submissions_page_idx").on(table.page)],
);

// Opportunities board: plain DB-backed CRUD, same trust level as task-tracker (no draft/review
// state - an admin saving a listing is already the review step). `publishedAt` is set once at
// creation and never changes on edit; history instead lives in opportunitiesAuditLog.
export const opportunityType = pgEnum("opportunity_type", ["job", "course"]);
export const opportunityCommitment = pgEnum("opportunity_commitment", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "fellowship",
]);
export const opportunityCompCurrency = pgEnum("opportunity_comp_currency", ["GBP", "USD", "EUR"]);
export const opportunityCompPeriod = pgEnum("opportunity_comp_period", ["year", "month", "week", "day", "hour"]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  type: opportunityType("type").notNull(),
  title: text("title").notNull(),
  org: text("org").notNull(),
  orgUrl: text("org_url"),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  locationCountry: text("location_country").notNull(),
  locationCity: text("location_city"),
  locationNote: text("location_note"),
  remote: boolean("remote").notNull(),
  commitment: opportunityCommitment("commitment"),
  compMin: integer("comp_min"),
  compMax: integer("comp_max"),
  compCurrency: opportunityCompCurrency("comp_currency"),
  compPeriod: opportunityCompPeriod("comp_period"),
  compNote: text("comp_note"),
  deadline: date("deadline"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  tags: jsonb("tags").$type<string[]>().default([]),
  applyUrl: text("apply_url").notNull(),
  applyLabel: text("apply_label"),
  sourceUrl: text("source_url"),
  publishedAt: date("published_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

// Same shape as taskTrackerAuditLog - a delete's `detail` holds a full snapshot of the row,
// since hard-deleting otherwise loses the record entirely (git previously kept this for free).
export const opportunitiesAuditLog = pgTable("opportunities_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  detail: jsonb("detail"),
});
