CREATE TABLE "token" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "id" TO "account_id";--> statement-breakpoint
ALTER TABLE "compute" DROP CONSTRAINT "compute_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "custom_vehicle_type" DROP CONSTRAINT "custom_vehicle_type_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "order" DROP CONSTRAINT "order_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "point_log" DROP CONSTRAINT "point_log_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_account_id_account_id_fk";
--> statement-breakpoint
DROP INDEX "account_account_gin";--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "algorithm" text DEFAULT '未設定' NOT NULL;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute" ADD CONSTRAINT "compute_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_vehicle_type" ADD CONSTRAINT "custom_vehicle_type_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_log" ADD CONSTRAINT "point_log_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_account_id_account_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id") ON DELETE cascade ON UPDATE no action;