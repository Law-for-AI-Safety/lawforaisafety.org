CREATE TYPE "public"."opportunity_commitment" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'fellowship');--> statement-breakpoint
CREATE TYPE "public"."opportunity_comp_currency" AS ENUM('GBP', 'USD', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."opportunity_comp_period" AS ENUM('year', 'month', 'week', 'day', 'hour');--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "comp_min" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "comp_max" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "comp_currency" "opportunity_comp_currency";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "comp_period" "opportunity_comp_period";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "comp_note" text;