CREATE TYPE "public"."newsletter_state" AS ENUM('draft', 'submitting', 'submitted');--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_schedule';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_send_now';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_reschedule';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_cancel';--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tested_version" integer,
	"state" "newsletter_state" DEFAULT 'draft' NOT NULL,
	"brevo_campaign_id" integer,
	"scheduled_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone
);
