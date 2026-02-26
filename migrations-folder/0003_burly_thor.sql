ALTER TABLE "point_distance" ALTER COLUMN "distance_from_a_b" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "point_distance" ALTER COLUMN "distance_from_a_b" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "point_distance" ALTER COLUMN "time_from_a_b" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "point_distance" ALTER COLUMN "time_from_a_b" DROP NOT NULL;