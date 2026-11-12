CREATE TABLE "coach_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"body" text NOT NULL,
	"created_by" integer,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_prompts" ADD CONSTRAINT "coach_prompts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_prompts_key" ON "coach_prompts" USING btree ("key","id");