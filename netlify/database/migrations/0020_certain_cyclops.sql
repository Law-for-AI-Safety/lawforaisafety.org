CREATE TYPE "public"."opportunity_type" AS ENUM('job', 'course');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"title" text NOT NULL,
	"org" text NOT NULL,
	"org_url" text,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"remote" boolean NOT NULL,
	"commitment" text,
	"compensation" text,
	"deadline" date,
	"start_date" date,
	"end_date" date,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"apply_url" text NOT NULL,
	"apply_label" text,
	"source_url" text,
	"published_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "opportunities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "opportunities_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"detail" jsonb
);
