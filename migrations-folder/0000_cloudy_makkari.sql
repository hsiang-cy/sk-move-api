CREATE TYPE "public"."account_role" AS ENUM('admin', 'manager', 'normal', 'guest', 'just_view');--> statement-breakpoint
CREATE TYPE "public"."compute_status" AS ENUM('initial', 'pending', 'computing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('inactive', 'active', 'deleted');--> statement-breakpoint
CREATE TABLE "account" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"account_role" "account_role" DEFAULT 'normal' NOT NULL,
	"account" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"company_industry" text,
	"name" text NOT NULL,
	"phone" text,
	"point" integer DEFAULT 0 NOT NULL,
	"comment_for_dev" text,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"data" jsonb,
	CONSTRAINT "account_account_unique" UNIQUE("account"),
	CONSTRAINT "account_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "compute" (
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"compute_status" "compute_status" DEFAULT 'initial' NOT NULL,
	"start_time" bigint,
	"end_time" bigint,
	"fail_reason" text,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"comment_for_account" text
);
--> statement-breakpoint
CREATE TABLE "custom_vehicle_type" (
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"comment_for_account" text
);
--> statement-breakpoint
CREATE TABLE "destination" (
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"lat" text NOT NULL,
	"lng" text NOT NULL,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"comment_for_account" text
);
--> statement-breakpoint
CREATE TABLE "point_distance" (
	"id" serial PRIMARY KEY NOT NULL,
	"a_point" integer NOT NULL,
	"b_point" integer NOT NULL,
	"distance_from_a_b" integer NOT NULL,
	"time_from_a_b" integer NOT NULL,
	"polyline_from_map_service" text,
	"polyline_real" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "order" (
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"destination_snapshot" jsonb NOT NULL,
	"vehicle_snapshot" jsonb NOT NULL,
	"comment_for_account" text
);
--> statement-breakpoint
CREATE TABLE "point_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"change" integer NOT NULL,
	"reason" text NOT NULL,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);
--> statement-breakpoint
CREATE TABLE "route" (
	"id" serial PRIMARY KEY NOT NULL,
	"compute_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"total_distance" integer NOT NULL,
	"total_time" integer NOT NULL,
	"total_load" integer DEFAULT 0 NOT NULL,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
);
--> statement-breakpoint
CREATE TABLE "route_stop" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"destination_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"arrival_time" integer DEFAULT 0 NOT NULL,
	"demand" integer DEFAULT 0 NOT NULL,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	CONSTRAINT "route_stop_route_id_sequence_unique" UNIQUE("route_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"account_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"vehicle_number" text NOT NULL,
	"vehicle_type" integer NOT NULL,
	"depot_id" integer,
	"data" jsonb,
	"created_at" bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
	"updated_at" bigint,
	"comment_for_account" text
);
--> statement-breakpoint
ALTER TABLE "compute" ADD CONSTRAINT "compute_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute" ADD CONSTRAINT "compute_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_vehicle_type" ADD CONSTRAINT "custom_vehicle_type_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_distance" ADD CONSTRAINT "point_distance_a_point_destination_id_fk" FOREIGN KEY ("a_point") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_distance" ADD CONSTRAINT "point_distance_b_point_destination_id_fk" FOREIGN KEY ("b_point") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_log" ADD CONSTRAINT "point_log_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_compute_id_compute_id_fk" FOREIGN KEY ("compute_id") REFERENCES "public"."compute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop" ADD CONSTRAINT "route_stop_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop" ADD CONSTRAINT "route_stop_destination_id_destination_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_vehicle_type_custom_vehicle_type_id_fk" FOREIGN KEY ("vehicle_type") REFERENCES "public"."custom_vehicle_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_depot_id_destination_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_account_index" ON "account" USING btree ("account");--> statement-breakpoint
CREATE INDEX "account_account_gin" ON "account" USING gin (to_tsvector('english', "account"));--> statement-breakpoint
CREATE INDEX "compute_account_id_index" ON "compute" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "compute_order_id_index" ON "compute" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "destination_account_id_index" ON "destination" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "destination_name_index" ON "destination" USING btree ("name");--> statement-breakpoint
CREATE INDEX "destination_address_index" ON "destination" USING btree ("address");--> statement-breakpoint
CREATE INDEX "order_account_id_index" ON "order" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "point_log_account_id_index" ON "point_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "route_compute_id_index" ON "route" USING btree ("compute_id");--> statement-breakpoint
CREATE INDEX "route_vehicle_id_index" ON "route" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "route_stop_route_id_index" ON "route_stop" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "vehicle_account_id_index" ON "vehicle" USING btree ("account_id");