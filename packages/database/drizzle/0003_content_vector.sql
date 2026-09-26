ALTER TABLE "resources" ADD COLUMN "content_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "resources_content_vector_idx" ON "resources" USING gin ("content_vector");