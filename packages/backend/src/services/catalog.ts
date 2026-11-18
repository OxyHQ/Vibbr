import {
  type EventCard,
  type EventInput,
  type EventListQuery,
  type EventPatch,
  newPublicId,
  type OrganizerInput,
  type VenueInput,
} from '@vibbr.co/contracts';
import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  lte,
  notExists,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { type DatabaseOrTransaction, getDb } from '../db';
import { events, organizers, ticketTypes, venues, waitlistEntries } from '../db/schema';
import { cancelEventOrders } from './orders';
import { ApiException, notFound } from '../utils/errors';
import { eventDto, organizerDto, venueDto } from './serialize';

type Db = DatabaseOrTransaction;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

// ---------------------------------------------------------------- organizers

export async function createOrganizer(
  oxyAccountId: string,
  input: OrganizerInput,
  db: Db = getDb(),
) {
  try {
    const [row] = await db
      .insert(organizers)
      .values({
        publicId: newPublicId('organizer'),
        oxyAccountId,
        kind: input.kind,
        name: input.name,
        handle: input.handle,
        bio: input.bio ?? null,
      })
      .returning();
    return organizerDto(row as NonNullable<typeof row>);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiException('conflict', 'That handle is taken');
    throw error;
  }
}

export async function findOrganizerRow(publicId: string, db: Db = getDb()) {
  const [row] = await db.select().from(organizers).where(eq(organizers.publicId, publicId));
  if (!row) throw notFound('Organizer');
  return row;
}

export async function getOrganizer(publicId: string, db: Db = getDb()) {
  return organizerDto(await findOrganizerRow(publicId, db));
}

export async function listOrganizersFor(oxyAccountId: string, db: Db = getDb()) {
  const rows = await db.select().from(organizers).where(eq(organizers.oxyAccountId, oxyAccountId));
  return rows.map(organizerDto);
}

// -------------------------------------------------------------------- venues

export async function createVenue(oxyAccountId: string, input: VenueInput, db: Db = getDb()) {
  const [row] = await db
    .insert(venues)
    .values({
      publicId: newPublicId('venue'),
      name: input.name,
      addressLine: input.addressLine,
      city: input.city,
      region: input.region,
      countryCode: input.countryCode,
      timeZone: input.timeZone,
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      capacity: input.capacity,
      createdByOxyAccountId: oxyAccountId,
    })
    .returning();
  return venueDto(row as NonNullable<typeof row>);
}

export async function getVenue(publicId: string, db: Db = getDb()) {
  const [row] = await db.select().from(venues).where(eq(venues.publicId, publicId));
  if (!row) throw notFound('Venue');
  return venueDto(row);
}

async function venueIdFor(publicId: string | null, db: Db): Promise<number | null> {
  if (publicId === null) return null;
  const [row] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.publicId, publicId));
  if (!row) throw new ApiException('validation_failed', 'Unknown venue');
  return row.id;
}

// -------------------------------------------------------------------- events

export async function findEventRow(publicId: string, db: Db = getDb()) {
  const [row] = await db
    .select({ event: events, organizer: organizers })
    .from(events)
    .innerJoin(organizers, eq(events.organizerId, organizers.id))
    .where(eq(events.publicId, publicId));
  if (!row) throw notFound('Event');
  return row;
}

async function venuePublicId(venueId: number | null, db: Db): Promise<string | null> {
  if (venueId === null) return null;
  const [row] = await db
    .select({ publicId: venues.publicId })
    .from(venues)
    .where(eq(venues.id, venueId));
  return row?.publicId ?? null;
}

export async function getEvent(publicId: string, db: Db = getDb()) {
  const { event, organizer } = await findEventRow(publicId, db);
  return eventDto(event, {
    organizerPublicId: organizer.publicId,
    venuePublicId: await venuePublicId(event.venueId, db),
  });
}

/** A draft or cancelled-and-hidden event is visible only to those who manage it. */
export function isPublic(status: string): boolean {
  return status === 'published' || status === 'cancelled' || status === 'ended';
}

export async function createEvent(input: EventInput, db: Db = getDb()) {
  const organizer = await findOrganizerRow(input.organizerId, db);
  const venueId = await venueIdFor(input.place.venueId, db);
  const [row] = await db
    .insert(events)
    .values({
      publicId: newPublicId('event'),
      organizerId: organizer.id,
      title: input.title,
      summary: input.summary ?? null,
      description: input.description ?? null,
      category: input.category,
      tags: input.tags,
      timeZone: input.timeZone,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      mode: input.place.mode,
      venueId,
      onlineUrl: input.place.onlineUrl,
      capacity: input.capacity ?? null,
      coverUrl: input.coverUrl ?? null,
      ageMinimum: input.ageMinimum ?? null,
      lineup: input.lineup,
    })
    .returning();
  const created = row as NonNullable<typeof row>;
  return eventDto(created, {
    organizerPublicId: organizer.publicId,
    venuePublicId: input.place.venueId,
  });
}

/**
 * An edit is applied only against the revision the editor saw. The UPDATE is
 * the check: no read-then-write window, and a stale editor gets a 409 instead
 * of overwriting someone else's change.
 */
export async function patchEvent(publicId: string, patch: EventPatch, db: Db = getDb()) {
  const { event } = await findEventRow(publicId, db);
  if (event.status === 'cancelled' || event.status === 'ended') {
    throw new ApiException('conflict', 'A cancelled or ended event cannot be edited');
  }
  const c = patch.changes;
  const startsAt = c.startsAt ? new Date(c.startsAt) : event.startsAt;
  const endsAt = c.endsAt === undefined ? event.endsAt : c.endsAt ? new Date(c.endsAt) : null;
  if (endsAt && endsAt <= startsAt) {
    throw new ApiException('validation_failed', 'endsAt must be after startsAt');
  }
  const place = c.place;
  const set: Partial<typeof events.$inferInsert> = {
    ...(c.title !== undefined && { title: c.title }),
    ...(c.summary !== undefined && { summary: c.summary }),
    ...(c.description !== undefined && { description: c.description }),
    ...(c.category !== undefined && { category: c.category }),
    ...(c.tags !== undefined && { tags: c.tags }),
    ...(c.capacity !== undefined && { capacity: c.capacity }),
    ...(c.coverUrl !== undefined && { coverUrl: c.coverUrl }),
    ...(c.ageMinimum !== undefined && { ageMinimum: c.ageMinimum }),
    ...(c.lineup !== undefined && { lineup: c.lineup }),
    startsAt,
    endsAt,
    ...(place && {
      mode: place.mode,
      venueId: await venueIdFor(place.venueId, db),
      onlineUrl: place.onlineUrl,
    }),
    revision: sql`${events.revision} + 1` as unknown as number,
    updatedAt: new Date(),
  };
  const updated = await db
    .update(events)
    .set(set)
    .where(and(eq(events.id, event.id), eq(events.revision, patch.revision)))
    .returning({ id: events.id });
  if (updated.length === 0) {
    throw new ApiException('revision_conflict', 'The event changed since you opened it');
  }
  return getEvent(publicId, db);
}

export async function publishEvent(publicId: string, revision: number, db: Db = getDb()) {
  const { event } = await findEventRow(publicId, db);
  if (event.status !== 'draft') throw new ApiException('conflict', 'Only a draft can be published');
  const updated = await db
    .update(events)
    .set({
      status: 'published',
      publishedAt: new Date(),
      revision: sql`${events.revision} + 1` as unknown as number,
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, event.id), eq(events.revision, revision), eq(events.status, 'draft')))
    .returning({ id: events.id });
  if (updated.length === 0)
    throw new ApiException('revision_conflict', 'The event changed since you opened it');
  return getEvent(publicId, db);
}

/** Marks every published event whose time has passed as ended. Run from a periodic job. */
export async function endPastEvents(now: Date, db: Db = getDb()): Promise<number> {
  const rows = await db
    .update(events)
    .set({
      status: 'ended',
      updatedAt: now,
      revision: sql`${events.revision} + 1` as unknown as number,
    })
    .where(
      and(
        eq(events.status, 'published'),
        // Without an end, an event is over six hours after it starts.
        sql`coalesce(${events.endsAt}, ${events.startsAt} + interval '6 hours') < ${now}`,
      ),
    )
    .returning({ id: events.id });
  return rows.length;
}

// ----------------------------------------------------------------- discovery

interface Cursor {
  readonly startsAt: string;
  readonly id: number;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (typeof parsed.startsAt === 'string' && Number.isSafeInteger(parsed.id)) return parsed;
  } catch {
    // fall through
  }
  throw new ApiException('bad_request', 'Invalid cursor');
}

const EARTH_RADIUS_KM = 6371;

function buildFilters(query: EventListQuery, now: Date): SQL[] {
  const filters: SQL[] = [eq(events.status, 'published')];
  filters.push(gte(events.startsAt, query.from ? new Date(query.from) : now));
  if (query.to) filters.push(lte(events.startsAt, new Date(query.to)));
  if (query.category) filters.push(eq(events.category, query.category));
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(
      or(
        ilike(events.title, pattern),
        ilike(events.summary, pattern),
        sql`exists (select 1 from unnest(${events.tags}) as tag where tag ilike ${pattern})`,
      ) as SQL,
    );
  }
  if (query.city || query.countryCode) {
    const venueFilters = [
      query.city ? ilike(venues.city, query.city) : undefined,
      query.countryCode ? eq(venues.countryCode, query.countryCode) : undefined,
    ].filter((f): f is SQL => f !== undefined);
    filters.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(venues)
          .where(and(eq(venues.id, events.venueId), ...venueFilters)),
      ),
    );
  }
  if (query.near) {
    const [lat, lon] = query.near.split(',').map(Number) as [number, number];
    filters.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(venues)
          .where(
            and(
              eq(venues.id, events.venueId),
              sql`${venues.latitude} is not null`,
              sql`${EARTH_RADIUS_KM} * 2 * asin(sqrt(
                power(sin(radians(${venues.latitude} - ${lat}) / 2), 2) +
                cos(radians(${lat})) * cos(radians(${venues.latitude})) *
                power(sin(radians(${venues.longitude} - ${lon}) / 2), 2)
              )) <= ${query.radiusKm}`,
            ),
          ),
      ),
    );
  }
  const visiblePriced = getDb()
    .select({ one: sql`1` })
    .from(ticketTypes)
    .where(
      and(
        eq(ticketTypes.eventId, events.id),
        eq(ticketTypes.hidden, false),
        gt(ticketTypes.priceAmount, sql`0`),
      ),
    );
  if (query.free === 'true') filters.push(notExists(visiblePriced));
  if (query.free === 'false') filters.push(exists(visiblePriced));
  return filters;
}

export async function listEvents(query: EventListQuery, now: Date = new Date(), db: Db = getDb()) {
  const filters = buildFilters(query, now);
  if (query.organizerId) {
    const organizer = await findOrganizerRow(query.organizerId, db);
    filters.push(eq(events.organizerId, organizer.id));
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    filters.push(
      sql`(${events.startsAt}, ${events.id}) > (${new Date(cursor.startsAt)}, ${cursor.id})`,
    );
  }
  const rows = await db
    .select({ event: events })
    .from(events)
    .where(and(...filters))
    .orderBy(asc(events.startsAt), asc(events.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit).map((r) => r.event);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor({ startsAt: last.startsAt.toISOString(), id: last.id })
      : null;
  return { items: await cardsFor(page, db), nextCursor };
}

type EventRowSelect = typeof events.$inferSelect;

/** Cards for already-loaded event rows, with price and availability in two queries, not N. */
export async function cardsFor(rows: EventRowSelect[], db: Db = getDb()): Promise<EventCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const orgIds = [...new Set(rows.map((r) => r.organizerId))];
  const venueIds = [...new Set(rows.flatMap((r) => (r.venueId === null ? [] : [r.venueId])))];

  const [orgRows, venueRows, typeRows] = await Promise.all([
    db.select().from(organizers).where(inArray(organizers.id, orgIds)),
    venueIds.length
      ? db.select().from(venues).where(inArray(venues.id, venueIds))
      : Promise.resolve([]),
    db
      .select()
      .from(ticketTypes)
      .where(and(inArray(ticketTypes.eventId, ids), eq(ticketTypes.hidden, false))),
  ]);
  const orgById = new Map(orgRows.map((o) => [o.id, o]));
  const venueById = new Map(venueRows.map((v) => [v.id, v]));

  return rows.map((event) => {
    const types = typeRows.filter((t) => t.eventId === event.id);
    const priced = types.filter((t) => t.priceAmount > 0n);
    const cheapest = priced.reduce<(typeof priced)[number] | undefined>(
      (best, t) => (best === undefined || t.priceAmount < best.priceAmount ? t : best),
      undefined,
    );
    const venue = event.venueId === null ? undefined : venueById.get(event.venueId);
    return {
      id: event.publicId as EventCard['id'],
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      timeZone: event.timeZone,
      status: event.status,
      coverUrl: event.coverUrl as EventCard['coverUrl'],
      venueName: venue?.name ?? null,
      city: venue?.city ?? null,
      organizerName: orgById.get(event.organizerId)?.name ?? '',
      priceFrom: cheapest
        ? { amount: cheapest.priceAmount.toString(), currency: cheapest.currency }
        : null,
      free: priced.length === 0,
      soldOut: types.length > 0 && types.every((t) => t.sold >= t.quota),
      url: `${eventDto(event, { organizerPublicId: '', venuePublicId: null }).url}` as EventCard['url'],
    };
  });
}

export async function getEventCards(publicIds: string[], db: Db = getDb()) {
  if (publicIds.length === 0) return [];
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.publicId, publicIds),
        inArray(events.status, ['published', 'cancelled', 'ended']),
      ),
    );
  return cardsFor(rows, db);
}

export async function getEventCard(publicId: string, db: Db = getDb()) {
  const [card] = await getEventCards([publicId], db);
  if (!card) throw notFound('Event');
  return card;
}

/**
 * Cancel an event: every open order is cancelled and its quota released, and
 * every open waitlist entry is closed (nobody is offered a ticket to a
 * cancelled event). The revision moves, so federation and Mention see the change.
 */
export async function cancelEvent(publicId: string, now: Date, db: Db = getDb()) {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.publicId, publicId))
      .for('update');
    if (!event) throw notFound('Event');
    if (event.status === 'cancelled') return;
    if (event.status === 'ended')
      throw new ApiException('conflict', 'An ended event cannot be cancelled');
    await tx
      .update(events)
      .set({
        status: 'cancelled',
        updatedAt: now,
        revision: sql`${events.revision} + 1` as unknown as number,
      })
      .where(eq(events.id, event.id));
    await cancelEventOrders(event.id, tx);
    await tx
      .update(waitlistEntries)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          inArray(waitlistEntries.status, ['waiting', 'offered']),
          inArray(
            waitlistEntries.ticketTypeId,
            tx
              .select({ id: ticketTypes.id })
              .from(ticketTypes)
              .where(eq(ticketTypes.eventId, event.id)),
          ),
        ),
      );
  });
  return getEvent(publicId, db);
}

/** Every event of an organizer, drafts included, newest first. For the organizer's own dashboard. */
export async function listOrganizerEvents(organizerPublicId: string, db: Db = getDb()) {
  const organizer = await findOrganizerRow(organizerPublicId, db);
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.organizerId, organizer.id))
    .orderBy(sql`${events.startsAt} desc`, sql`${events.id} desc`)
    .limit(200);
  return Promise.all(
    rows.map(async (event) =>
      eventDto(event, {
        organizerPublicId: organizer.publicId,
        venuePublicId: await venuePublicId(event.venueId, db),
      }),
    ),
  );
}
