CREATE TABLE "organova_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"cover_image" text,
	"category_id" integer,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"unpublished_at" timestamp with time zone,
	"visible_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organova_content_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organova_content_category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organova_content" ADD CONSTRAINT "organova_content_category_id_organova_content_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."organova_content_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organova_content" ADD CONSTRAINT "organova_content_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organova_content_category" ADD CONSTRAINT "organova_content_category_parent_id_organova_content_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organova_content_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_type_slug_idx" ON "organova_content" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "content_type_status_idx" ON "organova_content" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "content_published_at_idx" ON "organova_content" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "content_category_idx" ON "organova_content" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "content_category_parent_idx" ON "organova_content_category" USING btree ("parent_id");