CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('draft', 'review', 'published', 'unpublished', 'archived');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'skipped', 'infected');--> statement-breakpoint
CREATE TYPE "public"."share_channel" AS ENUM('whatsapp', 'facebook', 'x', 'telegram', 'email', 'copy', 'native');--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"admin_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "admin_roles_admin_id_role_id_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"csrf_token" varchar(64) NOT NULL,
	"ip_address" "inet",
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" smallint NOT NULL,
	"label" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "class_subjects_class_id_subject_id_pk" PRIMARY KEY("class_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"short_name" varchar(20),
	"slug" varchar(40) NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curricula_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "resource_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"plural_name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"show_in_nav" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "school_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_levels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"short_name" varchar(20),
	"slug" varchar(80) NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subtopics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(40) NOT NULL,
	"slug" varchar(40) NOT NULL,
	"number" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"subject_id" uuid,
	"class_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collection_resources" (
	"collection_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_resources_collection_id_resource_id_pk" PRIMARY KEY("collection_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text,
	"featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"cover_id" uuid,
	"seo_title" varchar(70),
	"seo_description" varchar(170),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(30) NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alt" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid,
	"storage_key" varchar(400) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"extension" varchar(10) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"page_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extracted_text" text,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"processed_at" timestamp with time zone,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"is_missing" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "resource_tags" (
	"resource_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "resource_tags_resource_id_tag_id_pk" PRIMARY KEY("resource_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "resource_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"notes" varchar(500),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"description" text,
	"short_description" varchar(300),
	"class_id" uuid,
	"subject_id" uuid,
	"resource_type_id" uuid,
	"academic_year_id" uuid,
	"term_id" uuid,
	"topic_id" uuid,
	"subtopic_id" uuid,
	"curriculum_id" uuid,
	"topic_text" varchar(160),
	"subtopic_text" varchar(160),
	"country" varchar(2) DEFAULT 'UG' NOT NULL,
	"author" varchar(160),
	"publisher" varchar(160),
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"file_id" uuid,
	"thumbnail_id" uuid,
	"status" "resource_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"trending_day" double precision DEFAULT 0 NOT NULL,
	"trending_week" double precision DEFAULT 0 NOT NULL,
	"popularity" double precision DEFAULT 0 NOT NULL,
	"seo_title" varchar(70),
	"seo_description" varchar(170),
	"canonical_url" varchar(500),
	"search_vector" "tsvector",
	"search_text" text,
	"indexed_at" timestamp with time zone,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(40) NOT NULL,
	"resource_id" uuid,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visitor_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" uuid,
	"admin_name" varchar(120),
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(64),
	"entity_label" varchar(300),
	"changes" jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_downloads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visitor_hash" varchar(64),
	"referrer_host" varchar(200),
	"device_type" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resource_id" uuid NOT NULL,
	"file_id" uuid
);
--> statement-breakpoint
CREATE TABLE "resource_shares" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visitor_hash" varchar(64),
	"referrer_host" varchar(200),
	"device_type" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resource_id" uuid NOT NULL,
	"channel" "share_channel" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_stats_daily" (
	"resource_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "resource_stats_daily_resource_id_day_pk" PRIMARY KEY("resource_id","day")
);
--> statement-breakpoint
CREATE TABLE "resource_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"visitor_hash" varchar(64),
	"referrer_host" varchar(200),
	"device_type" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resource_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" varchar(200) NOT NULL,
	"normalized" varchar(200) NOT NULL,
	"results_count" integer NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visitor_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(300) NOT NULL,
	"title" varchar(70),
	"description" varchar(170),
	"intro" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_metadata_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_stats_daily" (
	"day" date NOT NULL,
	"metric" varchar(40) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_stats_daily_day_metric_pk" PRIMARY KEY("day","metric")
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_level_id_school_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."school_levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_resources" ADD CONSTRAINT "collection_resources_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_resources" ADD CONSTRAINT "collection_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_id_media_assets_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_uploaded_by_id_admins_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_file_id_resource_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."resource_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_resource_type_id_resource_types_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_file_id_resource_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."resource_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_thumbnail_id_media_assets_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_downloads" ADD CONSTRAINT "resource_downloads_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_stats_daily" ADD CONSTRAINT "resource_stats_daily_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_views" ADD CONSTRAINT "resource_views_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "classes_level_idx" ON "classes" USING btree ("level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subtopics_topic_slug_uq" ON "subtopics" USING btree ("topic_id","slug");--> statement-breakpoint
CREATE INDEX "topics_subject_idx" ON "topics" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "resource_files_resource_idx" ON "resource_files" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_files_sha_idx" ON "resource_files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "resource_tags_tag_idx" ON "resource_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_versions_uq" ON "resource_versions" USING btree ("resource_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_slug_uq" ON "resources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "resources_status_published_idx" ON "resources" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resources_class_subject_type_idx" ON "resources" USING btree ("class_id","subject_id","resource_type_id");--> statement-breakpoint
CREATE INDEX "resources_subject_idx" ON "resources" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "resources_type_idx" ON "resources" USING btree ("resource_type_id");--> statement-breakpoint
CREATE INDEX "resources_year_idx" ON "resources" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "resources_topic_idx" ON "resources" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "resources_trending_week_idx" ON "resources" USING btree ("trending_week" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resources_downloads_idx" ON "resources" USING btree ("download_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resources_search_vector_idx" ON "resources" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "resources_search_text_trgm_idx" ON "resources" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "resources_title_trgm_idx" ON "resources" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "resources_featured_idx" ON "resources" USING btree ("featured") WHERE "resources"."featured" = true;--> statement-breakpoint
CREATE INDEX "analytics_events_type_created_idx" ON "analytics_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "resource_downloads_resource_created_idx" ON "resource_downloads" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_downloads_created_idx" ON "resource_downloads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resource_shares_resource_created_idx" ON "resource_shares" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_shares_created_idx" ON "resource_shares" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resource_stats_daily_day_idx" ON "resource_stats_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "resource_views_resource_created_idx" ON "resource_views" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_views_created_idx" ON "resource_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_queries_created_idx" ON "search_queries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_queries_normalized_idx" ON "search_queries" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "search_queries_normalized_trgm_idx" ON "search_queries" USING gin ("normalized" gin_trgm_ops);