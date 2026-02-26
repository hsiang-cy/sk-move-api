ALTER TABLE "point_distance" ALTER COLUMN "distance_from_a_b" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "point_distance" ALTER COLUMN "time_from_a_b" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "point_distance" ADD COLUMN "distance_from_a_b_dynamic" text;--> statement-breakpoint
ALTER TABLE "point_distance" ADD COLUMN "time_from_a_b_dynamic" text;