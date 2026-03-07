CREATE TABLE "token" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"text" text NOT NULL,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"dead_at" bigint,
	"updated_at" bigint,
	"data" jsonb,
	CONSTRAINT "token_text_unique" UNIQUE("text")
);
--> statement-breakpoint
CREATE TABLE "token_action_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"date" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_action_log" ADD CONSTRAINT "token_action_log_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE cascade ON UPDATE no action;