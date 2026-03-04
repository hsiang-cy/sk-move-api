CREATE TABLE "token_action_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"date" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "token" ADD COLUMN "dead_at" bigint;--> statement-breakpoint
ALTER TABLE "token_action_log" ADD CONSTRAINT "token_action_log_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE cascade ON UPDATE no action;