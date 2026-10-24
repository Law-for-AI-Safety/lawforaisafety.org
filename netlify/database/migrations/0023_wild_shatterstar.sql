ALTER TABLE "opportunities" ALTER COLUMN "location" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "location_country" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "location_city" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "location_note" text;