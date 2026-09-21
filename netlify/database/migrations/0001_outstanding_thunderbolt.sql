ALTER TABLE "newsletter_signups" ADD COLUMN "confirmation_token" text;--> statement-breakpoint
ALTER TABLE "newsletter_signups" ADD COLUMN "confirmed_at" timestamp with time zone;