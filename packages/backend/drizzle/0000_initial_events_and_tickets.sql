-- oxy:deploy-phase=pre
CREATE TABLE "attendance" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" bigint NOT NULL,
	"oxy_account_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "attendance_state_check" CHECK ("attendance"."state" in ('going', 'interested'))
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "checkins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" bigint NOT NULL,
	"ticket_id" bigint,
	"scanner_oxy_account_id" text NOT NULL,
	"result" text NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "checkins_result_check" CHECK ("checkins"."result" in ('admitted', 'already_used', 'invalid', 'wrong_event', 'cancelled', 'expired_code'))
);
--> statement-breakpoint
CREATE TABLE "event_staff" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_staff_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" bigint NOT NULL,
	"oxy_account_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"organizer_id" bigint NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"time_zone" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"mode" text NOT NULL,
	"venue_id" bigint,
	"online_url" text,
	"capacity" integer,
	"cover_url" text,
	"age_minimum" integer,
	"lineup" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "events_status_check" CHECK ("events"."status" in ('draft', 'published', 'cancelled', 'ended')),
	CONSTRAINT "events_mode_check" CHECK ("events"."mode" in ('in_person', 'online', 'hybrid')),
	CONSTRAINT "events_capacity_check" CHECK ("events"."capacity" is null or "events"."capacity" >= 1),
	CONSTRAINT "events_revision_check" CHECK ("events"."revision" >= 0),
	CONSTRAINT "events_end_after_start_check" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_place_check" CHECK (("events"."mode" = 'online' and "events"."online_url" is not null)
        or ("events"."mode" = 'in_person' and "events"."venue_id" is not null)
        or ("events"."mode" = 'hybrid' and "events"."venue_id" is not null and "events"."online_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"ticket_type_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"payment_choice" text NOT NULL,
	"holder_names" jsonb,
	CONSTRAINT "order_lines_quantity_check" CHECK ("order_lines"."quantity" between 1 and 100),
	CONSTRAINT "order_lines_choice_check" CHECK ("order_lines"."payment_choice" in ('free', 'door', 'online'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"event_id" bigint NOT NULL,
	"buyer_oxy_account_id" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"currency" text,
	"payment_status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('reserved', 'confirmed', 'expired', 'cancelled')),
	CONSTRAINT "orders_payment_status_check" CHECK ("orders"."payment_status" in ('not_required', 'not_collected', 'pending', 'paid', 'refunded', 'failed')),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"oxy_account_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "organizers_kind_check" CHECK ("organizers"."kind" in ('person', 'artist', 'company', 'venue', 'community'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_intent_id" text,
	"status" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resale_listings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resale_listings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"ticket_id" bigint NOT NULL,
	"event_id" bigint NOT NULL,
	"seller_oxy_account_id" text NOT NULL,
	"buyer_oxy_account_id" text,
	"price_amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "resale_listings_status_check" CHECK ("resale_listings"."status" in ('active', 'sold', 'withdrawn')),
	CONSTRAINT "resale_listings_price_check" CHECK ("resale_listings"."price_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_id" bigint NOT NULL,
	"from_oxy_account_id" text NOT NULL,
	"to_oxy_account_id" text NOT NULL,
	"kind" text NOT NULL,
	"resale_listing_id" bigint,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "ticket_transfers_distinct_check" CHECK ("ticket_transfers"."from_oxy_account_id" <> "ticket_transfers"."to_oxy_account_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"event_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"payment_mode" text NOT NULL,
	"quota" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"per_person_limit" integer DEFAULT 10 NOT NULL,
	"sales_start_at" timestamp with time zone,
	"sales_end_at" timestamp with time zone,
	"named" boolean DEFAULT false NOT NULL,
	"transferable" boolean DEFAULT true NOT NULL,
	"resellable" boolean DEFAULT false NOT NULL,
	"resale_cap_percent" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "ticket_types_payment_mode_check" CHECK ("ticket_types"."payment_mode" in ('free', 'door', 'online', 'choice')),
	CONSTRAINT "ticket_types_quota_check" CHECK ("ticket_types"."quota" >= 1),
	CONSTRAINT "ticket_types_sold_check" CHECK ("ticket_types"."sold" >= 0 and "ticket_types"."sold" <= "ticket_types"."quota"),
	CONSTRAINT "ticket_types_limit_check" CHECK ("ticket_types"."per_person_limit" between 1 and 100),
	CONSTRAINT "ticket_types_price_check" CHECK ("ticket_types"."price_amount" >= 0),
	CONSTRAINT "ticket_types_currency_check" CHECK ("ticket_types"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ticket_types_free_check" CHECK (("ticket_types"."payment_mode" = 'free') = ("ticket_types"."price_amount" = 0)),
	CONSTRAINT "ticket_types_resale_cap_check" CHECK ("ticket_types"."resale_cap_percent" is null or "ticket_types"."resale_cap_percent" between 100 and 1000),
	CONSTRAINT "ticket_types_sale_window_check" CHECK ("ticket_types"."sales_start_at" is null or "ticket_types"."sales_end_at" is null or "ticket_types"."sales_end_at" > "ticket_types"."sales_start_at")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"event_id" bigint NOT NULL,
	"ticket_type_id" bigint NOT NULL,
	"holder_oxy_account_id" text NOT NULL,
	"holder_name" text,
	"status" text NOT NULL,
	"payment_choice" text NOT NULL,
	"payment_status" text NOT NULL,
	"code_version" integer DEFAULT 1 NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('valid', 'used', 'listed', 'cancelled')),
	CONSTRAINT "tickets_choice_check" CHECK ("tickets"."payment_choice" in ('free', 'door', 'online')),
	CONSTRAINT "tickets_payment_status_check" CHECK ("tickets"."payment_status" in ('not_required', 'not_collected', 'pending', 'paid', 'refunded', 'failed')),
	CONSTRAINT "tickets_code_version_check" CHECK ("tickets"."code_version" >= 1),
	CONSTRAINT "tickets_checked_in_check" CHECK (("tickets"."status" = 'used') = ("tickets"."checked_in_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"address_line" text,
	"city" text NOT NULL,
	"region" text,
	"country_code" text NOT NULL,
	"time_zone" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"capacity" integer,
	"created_by_oxy_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "venues_capacity_check" CHECK ("venues"."capacity" is null or "venues"."capacity" >= 1),
	CONSTRAINT "venues_geo_check" CHECK (("venues"."latitude" is null) = ("venues"."longitude" is null)
        and ("venues"."latitude" is null or ("venues"."latitude" between -90 and 90 and "venues"."longitude" between -180 and 180)))
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "waitlist_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" text NOT NULL,
	"ticket_type_id" bigint NOT NULL,
	"oxy_account_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"offer_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "waitlist_entries_status_check" CHECK ("waitlist_entries"."status" in ('waiting', 'offered', 'claimed', 'expired', 'left')),
	CONSTRAINT "waitlist_entries_quantity_check" CHECK ("waitlist_entries"."quantity" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_resale_listing_id_resale_listings_id_fk" FOREIGN KEY ("resale_listing_id") REFERENCES "public"."resale_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_event_account_key" ON "attendance" USING btree ("event_id","oxy_account_id");--> statement-breakpoint
CREATE INDEX "attendance_account_idx" ON "attendance" USING btree ("oxy_account_id","state");--> statement-breakpoint
CREATE INDEX "checkins_event_idx" ON "checkins" USING btree ("event_id","scanned_at");--> statement-breakpoint
CREATE INDEX "checkins_ticket_idx" ON "checkins" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_staff_event_account_key" ON "event_staff" USING btree ("event_id","oxy_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_public_id_key" ON "events" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "events_listing_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "events_organizer_idx" ON "events" USING btree ("organizer_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category","starts_at");--> statement-breakpoint
CREATE INDEX "events_venue_idx" ON "events" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_ticket_type_idx" ON "order_lines" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_id_key" ON "orders" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key" ON "orders" USING btree ("buyer_oxy_account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_oxy_account_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_event_idx" ON "orders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "orders_expiry_idx" ON "orders" USING btree ("expires_at") WHERE "orders"."status" = 'reserved';--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_public_id_key" ON "organizers" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_handle_key" ON "organizers" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "organizers_oxy_account_idx" ON "organizers" USING btree ("oxy_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_public_id_key" ON "payments" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_intent_key" ON "payments" USING btree ("provider","provider_payment_intent_id") WHERE "payments"."provider_payment_intent_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resale_listings_public_id_key" ON "resale_listings" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resale_listings_one_active_key" ON "resale_listings" USING btree ("ticket_id") WHERE "resale_listings"."status" = 'active';--> statement-breakpoint
CREATE INDEX "resale_listings_event_idx" ON "resale_listings" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_transfers_ticket_idx" ON "ticket_transfers" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_types_public_id_key" ON "ticket_types" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "ticket_types_event_idx" ON "ticket_types" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_public_id_key" ON "tickets" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "tickets_holder_idx" ON "tickets" USING btree ("holder_oxy_account_id","status");--> statement-breakpoint
CREATE INDEX "tickets_event_idx" ON "tickets" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_public_id_key" ON "venues" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "venues_city_idx" ON "venues" USING btree ("country_code","city");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_public_id_key" ON "waitlist_entries" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_open_key" ON "waitlist_entries" USING btree ("ticket_type_id","oxy_account_id") WHERE "waitlist_entries"."status" in ('waiting', 'offered');--> statement-breakpoint
CREATE INDEX "waitlist_entries_queue_idx" ON "waitlist_entries" USING btree ("ticket_type_id","status","created_at");