ALTER TABLE "opportunities" ADD COLUMN "rolling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_submissions" ADD COLUMN "rolling" boolean DEFAULT false NOT NULL;