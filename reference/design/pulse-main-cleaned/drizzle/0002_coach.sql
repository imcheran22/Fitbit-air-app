CREATE TABLE "coach_chats" (
	"user_id" integer NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "coach_chats_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "coach_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"consent_at" bigint,
	"provider" text,
	"model" text,
	"key_ciphertext" "bytea",
	"key_last4" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "coach_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_chats" ADD CONSTRAINT "coach_chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_settings" ADD CONSTRAINT "coach_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_chats_recent" ON "coach_chats" USING btree ("user_id","updated_at");