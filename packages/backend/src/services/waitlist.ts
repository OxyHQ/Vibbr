import { type OrderInput, type WaitlistEntry, newPublicId } from '@vibbr.co/contracts';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { config } from '../config';
import { type DatabaseOrTransaction, type Transaction, getDb } from '../db';
import { events, ticketTypes, waitlistEntries } from '../db/schema';
import type { PaymentProvider } from '../payments/provider';
import { ApiException, notFound } from '../utils/errors';
import { findTicketTypeRow } from './ticketTypes';
import { reserveOrder } from './orders';

type Db = DatabaseOrTransaction;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

function dto(
  row: typeof waitlistEntries.$inferSelect,
  typePublicId: string,
  position: number | null,
): WaitlistEntry {
  return {
    id: row.publicId as WaitlistEntry['id'],
    ticketTypeId: typePublicId as WaitlistEntry['ticketTypeId'],
    status: row.status,
    quantity: row.quantity,
    offerExpiresAt: row.offerExpiresAt?.toISOString() ?? null,
    position,
  };
}

async function positionOf(
  db: Db,
  row: typeof waitlistEntries.$inferSelect,
): Promise<number | null> {
  if (row.status !== 'waiting') return null;
  const [{ ahead }] = (await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.ticketTypeId, row.ticketTypeId),
        eq(waitlistEntries.status, 'waiting'),
        sql`(${waitlistEntries.createdAt}, ${waitlistEntries.id}) < (${row.createdAt}, ${row.id})`,
      ),
    )) as [{ ahead: number }];
  return ahead + 1;
}

/** Join the queue for a sold-out ticket type. Only a sold-out type has a queue. */
export async function joinWaitlist(
  oxyAccountId: string,
  ticketTypePublicId: string,
  quantity: number,
  db: Db = getDb(),
): Promise<WaitlistEntry> {
  const type = await findTicketTypeRow(ticketTypePublicId, db);
  if (type.quota - type.sold >= quantity) {
    throw new ApiException('conflict', 'Tickets are available: buy them instead of waiting');
  }
  try {
    const [row] = await db
      .insert(waitlistEntries)
      .values({
        publicId: newPublicId('waitlistEntry'),
        ticketTypeId: type.id,
        oxyAccountId,
        quantity,
      })
      .returning();
    const created = row as NonNullable<typeof row>;
    return dto(created, type.publicId, await positionOf(db, created));
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ApiException('conflict', 'You are already on this waitlist');
    throw error;
  }
}

export async function leaveWaitlist(
  oxyAccountId: string,
  entryPublicId: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.publicId, entryPublicId),
          eq(waitlistEntries.oxyAccountId, oxyAccountId),
        ),
      )
      .for('update');
    if (!entry) throw notFound('Waitlist entry');
    if (entry.status === 'offered') {
      // Give the held tickets back, then offer them to the next in line.
      await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} - ${entry.quantity}` })
        .where(eq(ticketTypes.id, entry.ticketTypeId));
    } else if (entry.status !== 'waiting') {
      throw new ApiException('conflict', 'This waitlist entry is already closed');
    }
    await tx
      .update(waitlistEntries)
      .set({ status: 'left', updatedAt: new Date() })
      .where(eq(waitlistEntries.id, entry.id));
  });
}

export async function listWaitlistFor(
  oxyAccountId: string,
  db: Db = getDb(),
): Promise<WaitlistEntry[]> {
  const rows = await db
    .select({ entry: waitlistEntries, typePublicId: ticketTypes.publicId })
    .from(waitlistEntries)
    .innerJoin(ticketTypes, eq(ticketTypes.id, waitlistEntries.ticketTypeId))
    .where(
      and(
        eq(waitlistEntries.oxyAccountId, oxyAccountId),
        inArray(waitlistEntries.status, ['waiting', 'offered']),
      ),
    )
    .orderBy(asc(waitlistEntries.createdAt));
  return Promise.all(
    rows.map(async (r) => dto(r.entry, r.typePublicId, await positionOf(db, r.entry))),
  );
}

/**
 * Turn released quota into offers, in queue order. An offer HOLDS its tickets
 * (they are counted in `sold`) for `waitlistOfferMinutes`, so nobody else can
 * buy them out from under the person who was promised them. An entry that does
 * not fit the remaining quota is skipped, not allowed to block those behind it.
 */
export async function promoteWaitlist(
  ticketTypeIds: number[],
  now: Date,
  db: Db = getDb(),
): Promise<void> {
  for (const ticketTypeId of new Set(ticketTypeIds)) {
    await db.transaction((tx) => promoteOne(tx, ticketTypeId, now));
  }
}

async function promoteOne(tx: Transaction, ticketTypeId: number, now: Date): Promise<void> {
  const [type] = await tx
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.id, ticketTypeId))
    .for('update');
  if (!type) return;
  const queue = await tx
    .select()
    .from(waitlistEntries)
    .where(
      and(eq(waitlistEntries.ticketTypeId, ticketTypeId), eq(waitlistEntries.status, 'waiting')),
    )
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
  let remaining = type.quota - type.sold;
  for (const entry of queue) {
    if (remaining <= 0) break;
    if (entry.quantity > remaining) continue;
    remaining -= entry.quantity;
    await tx
      .update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${entry.quantity}` })
      .where(eq(ticketTypes.id, ticketTypeId));
    await tx
      .update(waitlistEntries)
      .set({
        status: 'offered',
        offerExpiresAt: new Date(now.getTime() + config.waitlistOfferMinutes * 60_000),
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, entry.id));
  }
}

/** Expire offers nobody claimed and pass their tickets on. Safe to run concurrently. */
export async function expireOffers(now: Date, db: Db = getDb()): Promise<void> {
  const freed = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.status, 'offered'), lte(waitlistEntries.offerExpiresAt, now)))
      .limit(100)
      .for('update', { skipLocked: true });
    for (const entry of due) {
      await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} - ${entry.quantity}` })
        .where(eq(ticketTypes.id, entry.ticketTypeId));
      await tx
        .update(waitlistEntries)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(waitlistEntries.id, entry.id));
    }
    return due.map((e) => e.ticketTypeId);
  });
  await promoteWaitlist(freed, now, db);
}

/**
 * Turn an offer into an order. The offer's held tickets become the order's
 * tickets, and the entry closes, in ONE transaction: a crash between the two
 * would leave the entry "offered" over tickets that already belong to an order,
 * and the expiry job would then release them a second time.
 */
export async function claimOffer(
  oxyAccountId: string,
  entryPublicId: string,
  idempotencyKey: string,
  options: { now: Date; provider: PaymentProvider; payWith?: 'free' | 'door' | 'online' },
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ entry: waitlistEntries, type: ticketTypes, eventPublicId: events.publicId })
      .from(waitlistEntries)
      .innerJoin(ticketTypes, eq(ticketTypes.id, waitlistEntries.ticketTypeId))
      .innerJoin(events, eq(events.id, ticketTypes.eventId))
      .where(
        and(
          eq(waitlistEntries.publicId, entryPublicId),
          eq(waitlistEntries.oxyAccountId, oxyAccountId),
        ),
      )
      .for('update', { of: waitlistEntries });
    if (!row) throw notFound('Waitlist entry');
    const input = orderInput(
      row.eventPublicId,
      row.type.publicId,
      row.entry.quantity,
      options.payWith,
    );

    // A retry of a claim that already went through finds its order, not an error.
    if (row.entry.status === 'claimed')
      return reserveOrder(oxyAccountId, input, idempotencyKey, options, tx);
    if (row.entry.status !== 'offered')
      throw new ApiException('gone', 'This offer is no longer available');
    if (row.entry.offerExpiresAt && options.now >= row.entry.offerExpiresAt) {
      throw new ApiException('gone', 'This offer expired');
    }

    const order = await reserveOrder(
      oxyAccountId,
      input,
      idempotencyKey,
      { ...options, held: new Map([[row.type.id, row.entry.quantity]]) },
      tx,
    );
    await tx
      .update(waitlistEntries)
      .set({ status: 'claimed', updatedAt: options.now })
      .where(eq(waitlistEntries.id, row.entry.id));
    return order;
  });
}

function orderInput(
  eventId: string,
  ticketTypeId: string,
  quantity: number,
  payWith: 'free' | 'door' | 'online' | undefined,
): OrderInput {
  return {
    eventId: eventId as OrderInput['eventId'],
    lines: [
      {
        ticketTypeId: ticketTypeId as OrderInput['lines'][number]['ticketTypeId'],
        quantity,
        ...(payWith && { payWith }),
      },
    ],
  };
}
