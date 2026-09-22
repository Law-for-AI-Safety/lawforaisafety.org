CREATE TABLE "admin_people" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
