CREATE TABLE "push_subscriptions" (
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_recovery_day" date,
	"last_sync_alert_day" date,
	CONSTRAINT "push_subscriptions_user_id_endpoint_pk" PRIMARY KEY("user_id","endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;