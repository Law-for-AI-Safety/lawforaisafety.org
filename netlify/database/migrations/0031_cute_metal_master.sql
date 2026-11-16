ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_web_publish';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'newsletter_web_unpublish';--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "publish_on_web" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_slug_unique" UNIQUE("slug");