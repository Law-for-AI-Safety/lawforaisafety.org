CREATE TYPE "public"."application_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('linkedin', 'google');--> statement-breakpoint
CREATE TYPE "public"."mailchimp_sync_status" AS ENUM('synced', 'failed', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."processed_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organisation" text,
	"linkedin_url" text,
	"cv_blob_key" text,
	"position_statement" text,
	"comments" text,
	"newsletter_opt_in" boolean DEFAULT false NOT NULL,
	"auth_provider" "auth_provider" NOT NULL,
	"name" text,
	"email" text,
	"picture_url" text,
	"provider_id" text,
	"state_token" text,
	"auth_error" text,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"mailchimp_sync_status" "mailchimp_sync_status",
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewer_notes" text,
	"prior_rejection_id" uuid
);
--> statement-breakpoint
CREATE TABLE "newsletter_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"outcome" "processed_outcome" NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewer_notes" text,
	CONSTRAINT "processed_applications_email_hash_unique" UNIQUE("email_hash")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_prior_rejection_id_processed_applications_id_fk" FOREIGN KEY ("prior_rejection_id") REFERENCES "public"."processed_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_provider_id_pending_idx" ON "applications" USING btree ("provider_id") WHERE "applications"."status" = 'pending';