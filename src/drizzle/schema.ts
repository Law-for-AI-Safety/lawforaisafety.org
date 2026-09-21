import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  jsonb,
  index,
  integer,
  primaryKey,
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
  ],
);

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
