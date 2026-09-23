ALTER TYPE "public"."admin_audit_action" ADD VALUE 'red_lines_toggle';--> statement-breakpoint
ALTER TABLE "red_lines_applications" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "red_lines_applications" ADD COLUMN "auth_provider" "auth_provider" DEFAULT 'linkedin' NOT NULL;