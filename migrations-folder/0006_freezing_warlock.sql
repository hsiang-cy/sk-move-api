CREATE TABLE "compute_one_click" (
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"status" "status" DEFAULT 'active' NOT NULL,
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"start_time" bigint,
	"data" jsonb,
	"comment_for_account" text
);
--> statement-breakpoint
ALTER TABLE "compute" DROP CONSTRAINT "compute_account_id_account_account_id_fk";
--> statement-breakpoint
ALTER TABLE "compute" DROP CONSTRAINT "compute_order_id_order_id_fk";
--> statement-breakpoint
DROP INDEX "compute_account_id_index";--> statement-breakpoint
DROP INDEX "compute_order_id_index";--> statement-breakpoint
TRUNCATE "compute" CASCADE;--> statement-breakpoint
ALTER TABLE "compute" ADD COLUMN "compute_one_click_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "compute" ADD COLUMN "algo_parameter" jsonb;--> statement-breakpoint
ALTER TABLE "compute" ADD COLUMN "comment_for_dev" text;--> statement-breakpoint
ALTER TABLE "compute_one_click" ADD CONSTRAINT "compute_one_click_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_one_click" ADD CONSTRAINT "compute_one_click_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compute_one_click_account_id_index" ON "compute_one_click" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "compute_one_click_order_id_index" ON "compute_one_click" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "compute" ADD CONSTRAINT "compute_compute_one_click_id_compute_one_click_id_fk" FOREIGN KEY ("compute_one_click_id") REFERENCES "public"."compute_one_click"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compute_compute_one_click_id_index" ON "compute" USING btree ("compute_one_click_id");--> statement-breakpoint
ALTER TABLE "compute" DROP COLUMN "account_id";--> statement-breakpoint
ALTER TABLE "compute" DROP COLUMN "order_id";