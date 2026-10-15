CREATE TYPE "public"."cms_permission" AS ENUM('draft', 'publish');--> statement-breakpoint
CREATE TYPE "public"."cms_submission_state" AS ENUM('open', 'merged', 'closed', 'withdrawn');--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_role_change';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_draft_save';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_draft_discard';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_publish';--> statement-breakpoint
CREATE TABLE "cms_drafts" (
	"page" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"base_hash" text NOT NULL,
	"valid" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_roles" (
	"email" text PRIMARY KEY NOT NULL,
	"permission" "cms_permission" NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text NOT NULL,
	"pr_number" integer NOT NULL,
	"branch" text NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" "cms_submission_state" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cms_submissions_page_idx" ON "cms_submissions" USING btree ("page");