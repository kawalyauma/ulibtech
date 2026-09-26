CREATE TABLE "resource_redirects" (
	"old_slug" varchar(140) PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_redirects" ADD CONSTRAINT "resource_redirects_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;