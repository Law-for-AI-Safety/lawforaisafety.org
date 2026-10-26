CREATE TYPE "public"."opportunity_submission_status" AS ENUM('draft', 'pending', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "opportunity_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_url" text,
	"type" "opportunity_type",
	"title" text,
	"org" text,
	"apply_url" text,
	"location" text,
	"remote" boolean DEFAULT false NOT NULL,
	"deadline" date,
	"start_date" date,
	"end_date" date,
	"description" text,
	"note" text,
	"auth_provider" "auth_provider" NOT NULL,
	"name" text,
	"email" text,
	"provider_id" text,
	"state_token" text,
	"auth_error" text,
	"status" "opportunity_submission_status" DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"rejection_reason" text,
	"opportunity_id" uuid
);
--> statement-breakpoint
ALTER TABLE "opportunity_submissions" ADD CONSTRAINT "opportunity_submissions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_submissions_status_idx" ON "opportunity_submissions" USING btree ("status");