import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
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
