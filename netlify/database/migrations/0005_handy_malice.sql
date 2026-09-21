CREATE TYPE "public"."admin_audit_action" AS ENUM('login', 'approve', 'reject', 'erase', 'signup_toggle');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"action" "admin_audit_action" NOT NULL,
	"subject_email_hash" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_subject_idx" ON "admin_audit_log" USING btree ("subject_email_hash");