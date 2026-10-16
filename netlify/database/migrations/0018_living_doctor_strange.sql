ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_withdraw';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'cms_publish_outcome';--> statement-breakpoint
ALTER TYPE "public"."cms_submission_state" ADD VALUE 'pending' BEFORE 'open';--> statement-breakpoint
ALTER TYPE "public"."cms_submission_state" ADD VALUE 'failed' BEFORE 'open';--> statement-breakpoint
ALTER TABLE "cms_submissions" ALTER COLUMN "pr_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_submissions" ALTER COLUMN "branch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_drafts" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "base_hash" text;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "draft_version" integer;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "merged_hash" text;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "closing_note" text;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD COLUMN "closing_note_by" text;