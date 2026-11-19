ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_web_publish';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_web_unpublish';--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "web_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "web_slug" text;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_web_slug_unique" UNIQUE("web_slug");