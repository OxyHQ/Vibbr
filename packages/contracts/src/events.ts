import { z } from 'zod';
import { EventId, OrganizerId, OxyAccountId, VenueId } from './ids';
import { CurrencyCode, MinorUnits } from './money';

export const EVENT_CATEGORIES = [
  'music',
  'nightlife',
  'arts',
  'theatre',
  'comedy',
  'sports',
  'food',
  'community',
  'business',
  'education',
  'family',
  'festival',
  'other',
] as const;
export const EventCategory = z.enum(EVENT_CATEGORIES);

export const EventStatus = z.enum(['draft', 'published', 'cancelled', 'ended']);
export type EventStatus = z.infer<typeof EventStatus>;

export const EventMode = z.enum(['in_person', 'online', 'hybrid']);

export const OrganizerKind = z.enum(['person', 'artist', 'company', 'venue', 'community']);

export const Organizer = z
  .object({
    id: OrganizerId,
    kind: OrganizerKind,
    oxyAccountId: OxyAccountId,
    name: z.string().min(1).max(120),
    handle: z.string().regex(/^[a-z0-9_]{3,30}$/),
    bio: z.string().max(2000).nullable(),
    avatarUrl: z.url().nullable(),
  })
  .strict();
export type Organizer = z.infer<typeof Organizer>;

export const OrganizerInput = Organizer.pick({ kind: true, name: true, handle: true })
  .extend({ bio: z.string().max(2000).nullable().optional() })
  .strict();
export type OrganizerInput = z.infer<typeof OrganizerInput>;

export const GeoPoint = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .strict();

export const Venue = z
  .object({
    id: VenueId,
    name: z.string().min(1).max(160),
    addressLine: z.string().max(300).nullable(),
    city: z.string().max(120),
    region: z.string().max(120).nullable(),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    timeZone: z.string().min(1).max(64),
    location: GeoPoint.nullable(),
    capacity: z.number().int().positive().nullable(),
  })
  .strict();
export type Venue = z.infer<typeof Venue>;
export const VenueInput = Venue.omit({ id: true }).strict();
export type VenueInput = z.infer<typeof VenueInput>;

const IsoInstant = z.iso.datetime();

/** Where an event happens: a venue, a link, or both. */
export const EventPlace = z
  .object({
    mode: EventMode,
    venueId: VenueId.nullable(),
    onlineUrl: z.url().nullable(),
  })
  .strict()
  .refine((p) => (p.mode === 'online' ? p.onlineUrl !== null : true), 'online events need a link')
  .refine(
    (p) => (p.mode === 'in_person' ? p.venueId !== null : true),
    'in-person events need a venue',
  )
  .refine(
    (p) => (p.mode === 'hybrid' ? p.venueId !== null && p.onlineUrl !== null : true),
    'hybrid events need both',
  );

export const LineupEntry = z
  .object({
    name: z.string().min(1).max(160),
    organizerId: OrganizerId.nullable(),
    startsAt: IsoInstant.nullable(),
    role: z.string().max(60).nullable(),
  })
  .strict();

export const Event = z
  .object({
    id: EventId,
    organizerId: OrganizerId,
    title: z.string().min(1).max(200),
    summary: z.string().max(500).nullable(),
    description: z.string().max(20000).nullable(),
    category: EventCategory,
    tags: z.array(z.string().min(1).max(40)).max(20),
    status: EventStatus,
    timeZone: z.string().min(1).max(64),
    startsAt: IsoInstant,
    endsAt: IsoInstant.nullable(),
    place: EventPlace,
    capacity: z.number().int().positive().nullable(),
    coverUrl: z.url().nullable(),
    ageMinimum: z.number().int().min(0).max(99).nullable(),
    lineup: z.array(LineupEntry).max(100),
    revision: z.number().int().nonnegative(),
    publishedAt: IsoInstant.nullable(),
    url: z.url(),
  })
  .strict();
export type Event = z.infer<typeof Event>;

export const EventInput = z
  .object({
    organizerId: OrganizerId,
    title: Event.shape.title,
    summary: Event.shape.summary.optional(),
    description: Event.shape.description.optional(),
    category: EventCategory,
    tags: Event.shape.tags.default([]),
    timeZone: Event.shape.timeZone,
    startsAt: IsoInstant,
    endsAt: IsoInstant.nullable().optional(),
    place: EventPlace,
    capacity: Event.shape.capacity.optional(),
    coverUrl: Event.shape.coverUrl.optional(),
    ageMinimum: Event.shape.ageMinimum.optional(),
    lineup: Event.shape.lineup.default([]),
  })
  .strict()
  .refine((e) => !e.endsAt || Date.parse(e.endsAt) > Date.parse(e.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type EventInput = z.infer<typeof EventInput>;

/** An edit carries the revision it was made against; a stale one is refused. */
export const EventPatch = z
  .object({
    revision: z.number().int().nonnegative(),
    changes: z
      .object({
        title: Event.shape.title,
        summary: Event.shape.summary,
        description: Event.shape.description,
        category: EventCategory,
        tags: Event.shape.tags,
        startsAt: IsoInstant,
        endsAt: IsoInstant.nullable(),
        place: EventPlace,
        capacity: Event.shape.capacity,
        coverUrl: Event.shape.coverUrl,
        ageMinimum: Event.shape.ageMinimum,
        lineup: Event.shape.lineup,
      })
      .partial()
      .strict(),
  })
  .strict();

export type EventPatch = z.infer<typeof EventPatch>;

export const EventRevision = z.object({ revision: z.number().int().nonnegative() }).strict();

/** What a Mention post or any other embed renders for an event. */
export const EventCard = z
  .object({
    id: EventId,
    title: z.string(),
    startsAt: IsoInstant,
    endsAt: IsoInstant.nullable(),
    timeZone: z.string(),
    status: EventStatus,
    coverUrl: z.url().nullable(),
    venueName: z.string().nullable(),
    city: z.string().nullable(),
    organizerName: z.string(),
    priceFrom: z.object({ amount: MinorUnits, currency: CurrencyCode }).strict().nullable(),
    free: z.boolean(),
    soldOut: z.boolean(),
    url: z.url(),
  })
  .strict();
export type EventCard = z.infer<typeof EventCard>;

export const EventListQuery = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    category: EventCategory.optional(),
    organizerId: OrganizerId.optional(),
    city: z.string().max(120).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    from: IsoInstant.optional(),
    to: IsoInstant.optional(),
    free: z.enum(['true', 'false']).optional(),
    near: z
      .string()
      .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
      .optional(),
    radiusKm: z.coerce.number().min(1).max(500).default(50),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(2048).optional(),
  })
  .strict();
export type EventListQuery = z.infer<typeof EventListQuery>;

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
