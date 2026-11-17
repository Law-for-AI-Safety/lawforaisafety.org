CREATE TABLE "admin_linkedin_retired" (
	"email" text PRIMARY KEY NOT NULL,
	"google_email" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
