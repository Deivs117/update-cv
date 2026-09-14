ALTER TABLE "applications" ADD COLUMN "cv_tex" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "cover_letter_tex" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "cover_letter_text" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "metadata" jsonb;