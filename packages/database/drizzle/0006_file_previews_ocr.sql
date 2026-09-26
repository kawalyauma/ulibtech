ALTER TABLE "resource_files" ADD COLUMN "preview_key" varchar(400);--> statement-breakpoint
ALTER TABLE "resource_files" ADD COLUMN "ocr_applied" boolean DEFAULT false NOT NULL;