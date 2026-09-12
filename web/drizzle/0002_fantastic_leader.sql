CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_user_id_period_pk" PRIMARY KEY("user_id","period")
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "usage_counters_select_own" ON "usage_counters" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("usage_counters"."user_id" = auth.uid());