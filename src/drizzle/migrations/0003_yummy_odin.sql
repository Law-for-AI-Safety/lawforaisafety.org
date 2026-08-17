CREATE TYPE "public"."notification_status" AS ENUM('sent', 'failed');--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "notification_status" "notification_status";