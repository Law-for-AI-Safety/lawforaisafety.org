CREATE TYPE "public"."opportunity_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "status" "opportunity_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_published_at_chk" CHECK (("opportunities"."status" = 'published') = ("opportunities"."published_at" IS NOT NULL));