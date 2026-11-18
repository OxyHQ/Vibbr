import { createdAt, updatedAt } from '@oxy.so/db';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  type PgColumn,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Every row has an internal `id` that never leaves the database and a
 * `publicId` (`<prefix>_<24 hex>`, see `@vibbr.co/contracts` ids) that is the
 * only id on the wire. Money is `bigint` minor units plus an ISO currency.
 * Instants are `timestamptz`.
 */

export const ORGANIZER_KINDS = ['person', 'artist', 'company', 'venue', 'community'] as const;
export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'ended'] as const;
export const EVENT_MODES = ['in_person', 'online', 'hybrid'] as const;
export const PAYMENT_MODES = ['free', 'door', 'online', 'choice'] as const;
export const PAYMENT_CHOICES = ['free', 'door', 'online'] as const;
export const ORDER_STATUSES = ['reserved', 'confirmed', 'expired', 'cancelled'] as const;
export const PAYMENT_STATUSES = [
  'not_required',
  'not_collected',
  'pending',
  'paid',
  'refunded',
  'failed',
] as const;
export const TICKET_STATUSES = ['valid', 'used', 'listed', 'cancelled'] as const;
export const RESALE_STATUSES = ['active', 'sold', 'withdrawn'] as const;
export const WAITLIST_STATUSES = ['waiting', 'offered', 'claimed', 'expired', 'left'] as const;
export const ATTENDANCE_STATES = ['going', 'interested'] as const;
export const SCAN_RESULTS = [
  'admitted',
  'already_used',
  'invalid',
  'wrong_event',
  'cancelled',
  'expired_code',
] as const;

function oneOf(column: PgColumn, values: readonly string[]) {
  const choices = values.map((value) => `'${value.split("'").join("''")}'`).join(', ');
  return sql`${column} in (${sql.raw(choices)})`;
}

const identity = () => bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const instant = () => timestamp({ withTimezone: true, mode: 'date' });
const money = () => bigint({ mode: 'bigint' });

export const organizers = pgTable(
  'organizers',
  {
    id: identity(),
    publicId: text().notNull(),
    oxyAccountId: text().notNull(),
    kind: text({ enum: ORGANIZER_KINDS }).notNull(),
    name: text().notNull(),
    handle: text().notNull(),
    bio: text(),
    avatarUrl: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('organizers_public_id_key').on(t.publicId),
    uniqueIndex('organizers_handle_key').on(t.handle),
    index('organizers_oxy_account_idx').on(t.oxyAccountId),
    check('organizers_kind_check', oneOf(t.kind, ORGANIZER_KINDS)),
  ],
);

export const venues = pgTable(
  'venues',
  {
    id: identity(),
    publicId: text().notNull(),
    name: text().notNull(),
    addressLine: text(),
    city: text().notNull(),
    region: text(),
    countryCode: text().notNull(),
    timeZone: text().notNull(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    capacity: integer(),
    createdByOxyAccountId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('venues_public_id_key').on(t.publicId),
    index('venues_city_idx').on(t.countryCode, t.city),
    check('venues_capacity_check', sql`${t.capacity} is null or ${t.capacity} >= 1`),
    check(
      'venues_geo_check',
      sql`(${t.latitude} is null) = (${t.longitude} is null)
        and (${t.latitude} is null or (${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180))`,
    ),
  ],
);

export interface LineupEntryRow {
  readonly name: string;
  readonly organizerId: string | null;
  readonly startsAt: string | null;
  readonly role: string | null;
}

export const events = pgTable(
  'events',
  {
    id: identity(),
    publicId: text().notNull(),
    organizerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizers.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    summary: text(),
    description: text(),
    category: text().notNull(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    status: text({ enum: EVENT_STATUSES }).notNull().default('draft'),
    timeZone: text().notNull(),
    startsAt: instant().notNull(),
    endsAt: instant(),
    mode: text({ enum: EVENT_MODES }).notNull(),
    venueId: bigint({ mode: 'number' }).references(() => venues.id, { onDelete: 'restrict' }),
    onlineUrl: text(),
    capacity: integer(),
    coverUrl: text(),
    ageMinimum: integer(),
    lineup: jsonb().$type<LineupEntryRow[]>().notNull().default(sql`'[]'::jsonb`),
    revision: integer().notNull().default(0),
    publishedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('events_public_id_key').on(t.publicId),
    index('events_listing_idx').on(t.status, t.startsAt),
    index('events_organizer_idx').on(t.organizerId, t.startsAt),
    index('events_category_idx').on(t.category, t.startsAt),
    index('events_venue_idx').on(t.venueId),
    check('events_status_check', oneOf(t.status, EVENT_STATUSES)),
    check('events_mode_check', oneOf(t.mode, EVENT_MODES)),
    check('events_capacity_check', sql`${t.capacity} is null or ${t.capacity} >= 1`),
    check('events_revision_check', sql`${t.revision} >= 0`),
    check('events_end_after_start_check', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      'events_place_check',
      sql`(${t.mode} = 'online' and ${t.onlineUrl} is not null)
        or (${t.mode} = 'in_person' and ${t.venueId} is not null)
        or (${t.mode} = 'hybrid' and ${t.venueId} is not null and ${t.onlineUrl} is not null)`,
    ),
  ],
);

export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: identity(),
    publicId: text().notNull(),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    priceAmount: money().notNull(),
    currency: text().notNull(),
    paymentMode: text({ enum: PAYMENT_MODES }).notNull(),
    quota: integer().notNull(),
    /** Tickets held by live orders and issued tickets. Moved only by a guarded UPDATE. */
    sold: integer().notNull().default(0),
    perPersonLimit: integer().notNull().default(10),
    salesStartAt: instant(),
    salesEndAt: instant(),
    named: boolean().notNull().default(false),
    transferable: boolean().notNull().default(true),
    resellable: boolean().notNull().default(false),
    resaleCapPercent: integer(),
    hidden: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ticket_types_public_id_key').on(t.publicId),
    index('ticket_types_event_idx').on(t.eventId),
    check('ticket_types_payment_mode_check', oneOf(t.paymentMode, PAYMENT_MODES)),
    check('ticket_types_quota_check', sql`${t.quota} >= 1`),
    check('ticket_types_sold_check', sql`${t.sold} >= 0 and ${t.sold} <= ${t.quota}`),
    check('ticket_types_limit_check', sql`${t.perPersonLimit} between 1 and 100`),
    check('ticket_types_price_check', sql`${t.priceAmount} >= 0`),
    check('ticket_types_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('ticket_types_free_check', sql`(${t.paymentMode} = 'free') = (${t.priceAmount} = 0)`),
    check(
      'ticket_types_resale_cap_check',
      sql`${t.resaleCapPercent} is null or ${t.resaleCapPercent} between 100 and 1000`,
    ),
    check(
      'ticket_types_sale_window_check',
      sql`${t.salesStartAt} is null or ${t.salesEndAt} is null or ${t.salesEndAt} > ${t.salesStartAt}`,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: identity(),
    publicId: text().notNull(),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    buyerOxyAccountId: text().notNull(),
    status: text({ enum: ORDER_STATUSES }).notNull(),
    expiresAt: instant(),
    totalAmount: money().notNull().default(sql`0`),
    currency: text(),
    paymentStatus: text({ enum: PAYMENT_STATUSES }).notNull(),
    idempotencyKey: text().notNull(),
    /** Fingerprint of the request that created the order: a reused key with another body is refused. */
    requestHash: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_public_id_key').on(t.publicId),
    uniqueIndex('orders_idempotency_key').on(t.buyerOxyAccountId, t.idempotencyKey),
    index('orders_buyer_idx').on(t.buyerOxyAccountId, t.createdAt),
    index('orders_event_idx').on(t.eventId),
    index('orders_expiry_idx').on(t.expiresAt).where(sql`${t.status} = 'reserved'`),
    check('orders_status_check', oneOf(t.status, ORDER_STATUSES)),
    check('orders_payment_status_check', oneOf(t.paymentStatus, PAYMENT_STATUSES)),
    check('orders_total_check', sql`${t.totalAmount} >= 0`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: identity(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    ticketTypeId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'restrict' }),
    quantity: integer().notNull(),
    unitAmount: money().notNull(),
    currency: text().notNull(),
    paymentChoice: text({ enum: PAYMENT_CHOICES }).notNull(),
    holderNames: jsonb().$type<string[]>(),
  },
  (t) => [
    index('order_lines_order_idx').on(t.orderId),
    index('order_lines_ticket_type_idx').on(t.ticketTypeId),
    check('order_lines_quantity_check', sql`${t.quantity} between 1 and 100`),
    check('order_lines_choice_check', oneOf(t.paymentChoice, PAYMENT_CHOICES)),
  ],
);

/**
 * One row per attempt to collect money for an order. In v1 nothing is collected
 * online (ADR 0001 §3): a row appears only when the Peable rail is enabled and
 * holds Peable's payment intent id, never a provider object or key.
 */
export const payments = pgTable(
  'payments',
  {
    id: identity(),
    publicId: text().notNull(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    provider: text({ enum: ['peable'] }).notNull(),
    providerPaymentIntentId: text(),
    status: text({ enum: PAYMENT_STATUSES }).notNull(),
    amount: money().notNull(),
    currency: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payments_public_id_key').on(t.publicId),
    uniqueIndex('payments_provider_intent_key')
      .on(t.provider, t.providerPaymentIntentId)
      .where(sql`${t.providerPaymentIntentId} is not null`),
    index('payments_order_idx').on(t.orderId),
    check('payments_amount_check', sql`${t.amount} >= 0`),
  ],
);

export const tickets = pgTable(
  'tickets',
  {
    id: identity(),
    publicId: text().notNull(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    ticketTypeId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'restrict' }),
    holderOxyAccountId: text().notNull(),
    holderName: text(),
    status: text({ enum: TICKET_STATUSES }).notNull(),
    paymentChoice: text({ enum: PAYMENT_CHOICES }).notNull(),
    paymentStatus: text({ enum: PAYMENT_STATUSES }).notNull(),
    /** Bumped on every transfer or resale: a code minted for an older holder stops verifying. */
    codeVersion: integer().notNull().default(1),
    checkedInAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tickets_public_id_key').on(t.publicId),
    index('tickets_holder_idx').on(t.holderOxyAccountId, t.status),
    index('tickets_event_idx').on(t.eventId, t.status),
    index('tickets_order_idx').on(t.orderId),
    check('tickets_status_check', oneOf(t.status, TICKET_STATUSES)),
    check('tickets_choice_check', oneOf(t.paymentChoice, PAYMENT_CHOICES)),
    check('tickets_payment_status_check', oneOf(t.paymentStatus, PAYMENT_STATUSES)),
    check('tickets_code_version_check', sql`${t.codeVersion} >= 1`),
    check('tickets_checked_in_check', sql`(${t.status} = 'used') = (${t.checkedInAt} is not null)`),
  ],
);

export const resaleListings = pgTable(
  'resale_listings',
  {
    id: identity(),
    publicId: text().notNull(),
    ticketId: bigint({ mode: 'number' })
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    sellerOxyAccountId: text().notNull(),
    buyerOxyAccountId: text(),
    priceAmount: money().notNull(),
    currency: text().notNull(),
    status: text({ enum: RESALE_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('resale_listings_public_id_key').on(t.publicId),
    // A ticket has at most one open listing.
    uniqueIndex('resale_listings_one_active_key').on(t.ticketId).where(sql`${t.status} = 'active'`),
    index('resale_listings_event_idx').on(t.eventId, t.status),
    check('resale_listings_status_check', oneOf(t.status, RESALE_STATUSES)),
    check('resale_listings_price_check', sql`${t.priceAmount} >= 0`),
  ],
);

export const ticketTransfers = pgTable(
  'ticket_transfers',
  {
    id: identity(),
    ticketId: bigint({ mode: 'number' })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    fromOxyAccountId: text().notNull(),
    toOxyAccountId: text().notNull(),
    kind: text({ enum: ['transfer', 'resale'] }).notNull(),
    resaleListingId: bigint({ mode: 'number' }).references(() => resaleListings.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('ticket_transfers_ticket_idx').on(t.ticketId, t.createdAt),
    check('ticket_transfers_distinct_check', sql`${t.fromOxyAccountId} <> ${t.toOxyAccountId}`),
  ],
);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: identity(),
    publicId: text().notNull(),
    ticketTypeId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'cascade' }),
    oxyAccountId: text().notNull(),
    quantity: integer().notNull().default(1),
    status: text({ enum: WAITLIST_STATUSES }).notNull().default('waiting'),
    offerExpiresAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('waitlist_entries_public_id_key').on(t.publicId),
    // One open entry per person per ticket type.
    uniqueIndex('waitlist_entries_open_key')
      .on(t.ticketTypeId, t.oxyAccountId)
      .where(sql`${t.status} in ('waiting', 'offered')`),
    index('waitlist_entries_queue_idx').on(t.ticketTypeId, t.status, t.createdAt),
    check('waitlist_entries_status_check', oneOf(t.status, WAITLIST_STATUSES)),
    check('waitlist_entries_quantity_check', sql`${t.quantity} between 1 and 100`),
  ],
);

export const checkins = pgTable(
  'checkins',
  {
    id: identity(),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    ticketId: bigint({ mode: 'number' }).references(() => tickets.id, { onDelete: 'set null' }),
    scannerOxyAccountId: text().notNull(),
    result: text({ enum: SCAN_RESULTS }).notNull(),
    /** When the door scanner read the code; differs from `createdAt` for an offline batch. */
    scannedAt: instant().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('checkins_event_idx').on(t.eventId, t.scannedAt),
    index('checkins_ticket_idx').on(t.ticketId),
    check('checkins_result_check', oneOf(t.result, SCAN_RESULTS)),
  ],
);

export const attendance = pgTable(
  'attendance',
  {
    id: identity(),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    oxyAccountId: text().notNull(),
    state: text({ enum: ATTENDANCE_STATES }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('attendance_event_account_key').on(t.eventId, t.oxyAccountId),
    index('attendance_account_idx').on(t.oxyAccountId, t.state),
    check('attendance_state_check', oneOf(t.state, ATTENDANCE_STATES)),
  ],
);

/** Who may run an event's door and edit it besides the organizer's own account. */
export const eventStaff = pgTable(
  'event_staff',
  {
    id: identity(),
    eventId: bigint({ mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    oxyAccountId: text().notNull(),
    role: text({ enum: ['scanner', 'manager'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('event_staff_event_account_key').on(t.eventId, t.oxyAccountId)],
);
