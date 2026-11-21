-- oxy:deploy-phase=pre
CREATE TABLE "federation_followers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "federation_followers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organizer_id" bigint NOT NULL,
	"actor_uri" text NOT NULL,
	"inbox_url" text NOT NULL,
	"shared_inbox_url" text,
	"follow_activity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "federation_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organizer_id" bigint NOT NULL,
	"inbox_url" text NOT NULL,
	"activity" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "federation_followers" ADD CONSTRAINT "federation_followers_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federation_outbox" ADD CONSTRAINT "federation_outbox_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "federation_followers_actor_key" ON "federation_followers" USING btree ("organizer_id","actor_uri");--> statement-breakpoint
CREATE INDEX "federation_followers_organizer_idx" ON "federation_followers" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "federation_outbox_due_idx" ON "federation_outbox" USING btree ("next_attempt_at") WHERE "federation_outbox"."delivered_at" is null and "federation_outbox"."failed_at" is null;