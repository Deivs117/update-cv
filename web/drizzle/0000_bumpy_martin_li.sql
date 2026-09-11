-- NOTA (issue #8): drizzle-kit generó originalmente un `CREATE TABLE "auth"."users"`
-- acá -- se quitó a mano. `auth.users` ya existe en cualquier proyecto Supabase
-- real (lo gestiona Supabase Auth); crearlo de nuevo rompe la migración contra
-- una base real ("relation already exists"). schemaFilter: ["public"] en
-- drizzle.config.ts no evita esto por sí solo (issue conocida de la comunidad
-- Drizzle+Supabase) -- las foreign keys hacia auth.users más abajo sí son
-- correctas y se dejan intactas, solo se quitó el CREATE TABLE.
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"job_description" text NOT NULL,
	"tailored_content" jsonb,
	"cv_pdf_path" text,
	"cover_letter_pdf_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"stage" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "applications_select_own" ON "applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("applications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "applications_insert_own" ON "applications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("applications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "applications_update_own" ON "applications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("applications"."user_id" = auth.uid()) WITH CHECK ("applications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "applications_delete_own" ON "applications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("applications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "jobs_select_own" ON "jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("jobs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "jobs_insert_own" ON "jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("jobs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "jobs_update_own" ON "jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("jobs"."user_id" = auth.uid()) WITH CHECK ("jobs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."id" = auth.uid());--> statement-breakpoint
CREATE POLICY "profiles_insert_own" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("profiles"."id" = auth.uid());--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = auth.uid()) WITH CHECK ("profiles"."id" = auth.uid());--> statement-breakpoint
CREATE POLICY "profiles_delete_own" ON "profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("profiles"."id" = auth.uid());