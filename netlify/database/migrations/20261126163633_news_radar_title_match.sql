ALTER TABLE "news_radar_items" DROP CONSTRAINT "news_radar_items_title_key_unique";--> statement-breakpoint
ALTER TABLE "news_radar_runs" ADD COLUMN "error" text;--> statement-breakpoint
CREATE INDEX "news_radar_items_title_key_idx" ON "news_radar_items" USING btree ("title_key");