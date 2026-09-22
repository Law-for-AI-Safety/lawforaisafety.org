CREATE TYPE "public"."task_tracker_status" AS ENUM('draft', 'ready', 'in_progress', 'blocked', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "task_tracker_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "task_tracker_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_email" text,
	"status" "task_tracker_status" DEFAULT 'draft' NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_tracker_task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "task_tracker_task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_tracker_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"resource_links" jsonb DEFAULT '[]'::jsonb,
	"assignee_email" text,
	"status" "task_tracker_status" DEFAULT 'draft' NOT NULL,
	"blocked_reason" text,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_tracker_task_dependencies" ADD CONSTRAINT "task_tracker_task_dependencies_task_id_task_tracker_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_tracker_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tracker_task_dependencies" ADD CONSTRAINT "task_tracker_task_dependencies_depends_on_task_id_task_tracker_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."task_tracker_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tracker_tasks" ADD CONSTRAINT "task_tracker_tasks_project_id_task_tracker_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."task_tracker_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_tracker_task_dependencies_depends_on_idx" ON "task_tracker_task_dependencies" USING btree ("depends_on_task_id");