ALTER TABLE "token" ADD COLUMN "status" "status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_text_unique" UNIQUE("text");