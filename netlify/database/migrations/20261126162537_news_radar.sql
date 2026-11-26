CREATE TYPE "public"."news_radar_item_state" AS ENUM('new', 'useful', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."news_radar_run_trigger" AS ENUM('schedule', 'manual');--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'news_radar_settings';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'news_radar_run';--> statement-breakpoint
CREATE TABLE "news_radar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url_key" text NOT NULL,
	"title_key" text NOT NULL,
	"story_key" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"outlet" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"published_at" timestamp with time zone,
	"sources" text[] NOT NULL,
	"topics" text[] NOT NULL,
	"score" integer NOT NULL,
	"state" "news_radar_item_state" DEFAULT 'new' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_run_id" uuid,
	"last_run_id" uuid,
	"triaged_by" text,
	"triaged_at" timestamp with time zone,
	CONSTRAINT "news_radar_items_url_key_unique" UNIQUE("url_key")
);
--> statement-breakpoint
CREATE TABLE "news_radar_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" "news_radar_run_trigger" NOT NULL,
	"triggered_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"email" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "news_radar_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"topics" jsonb NOT NULL,
	"trusted_outlets" text[] NOT NULL,
	"recipient" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_radar_settings_one_row" CHECK ("news_radar_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "news_radar_items" ADD CONSTRAINT "news_radar_items_first_run_id_news_radar_runs_id_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."news_radar_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_radar_items" ADD CONSTRAINT "news_radar_items_last_run_id_news_radar_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."news_radar_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_radar_items_first_seen_idx" ON "news_radar_items" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "news_radar_items_last_run_idx" ON "news_radar_items" USING btree ("last_run_id");--> statement-breakpoint
CREATE INDEX "news_radar_items_title_key_idx" ON "news_radar_items" USING btree ("title_key");