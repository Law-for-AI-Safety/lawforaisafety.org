CREATE TYPE "public"."red_lines_area" AS ENUM('legal_governance', 'technical');--> statement-breakpoint
CREATE TYPE "public"."red_lines_eu_interest" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "red_lines_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"area_of_expertise" "red_lines_area",
	"motivation" text,
	"available_hours" integer,
	"available_oct_12" boolean DEFAULT false NOT NULL,
	"available_nov_9" boolean DEFAULT false NOT NULL,
	"available_dec_7" boolean DEFAULT false NOT NULL,
	"eu_parliament_interest" "red_lines_eu_interest",
	"affiliation" text,
	"publication_example" text,
	"name" text,
	"email" text,
	"picture_url" text,
	"provider_id" text,
	"state_token" text,
	"auth_error" text,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewer_notes" text,
	"notification_status" "notification_status",
	CONSTRAINT "red_lines_applications_provider_id_unique" UNIQUE("provider_id")
);
