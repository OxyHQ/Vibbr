import { type ResaleListing, newPublicId } from '@vibbr.co/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type DatabaseOrTransaction, getDb } from '../db';
import { events, resaleListings, ticketTransfers, ticketTypes, tickets } from '../db/schema';
import { ApiException, notFound } from '../utils/errors';
import { listingDto } from './serialize';

type Db = DatabaseOrTransaction;

/** Highest price a ticket may be resold at: face value, or face value times its cap. */
export function resaleCeiling(faceValue: bigint, capPercent: number | null): bigint {
  return (faceValue * BigInt(capPercent ?? 100)) / 100n;
}

/**
 * Put a ticket up for resale. In v1 nothing moves money in the app (ADR 0001
 * §3): the price is the agreed price, settled between the two people. The cap
 * still binds, so the marketplace cannot be used to scalp.
 */
export async function createListing(
  sellerId: string,
  ticketPublicId: string,
  priceAmount: string,
  now: Date,
  db: Db = getDb(),
): Promise<ResaleListing> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ ticket: tickets, type: ticketTypes, event: events })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(and(eq(tickets.publicId, ticketPublicId), eq(tickets.holderOxyAccountId, sellerId)))
      .for('update', { of: tickets });
    if (!row) throw notFound('Ticket');
    if (row.ticket.status !== 'valid')
      throw new ApiException('conflict', 'This ticket cannot be listed');
    if (!row.type.resellable) throw new ApiException('conflict', 'This ticket cannot be resold');
    if (now >= row.event.startsAt) throw new ApiException('conflict', 'The event already started');
    const price = BigInt(priceAmount);
    const ceiling = resaleCeiling(row.type.priceAmount, row.type.resaleCapPercent);
    if (price > ceiling) {
      throw new ApiException('validation_failed', 'The price is above the resale limit', {
        maxAmount: ceiling.toString(),
      });
    }
    await tx
      .update(tickets)
      .set({ status: 'listed', updatedAt: now })
      .where(eq(tickets.id, row.ticket.id));
    const [listing] = await tx
      .insert(resaleListings)
      .values({
        publicId: newPublicId('resaleListing'),
        ticketId: row.ticket.id,
        eventId: row.event.id,
        sellerOxyAccountId: sellerId,
        priceAmount: price,
        currency: row.type.currency,
      })
      .returning();
    return listingDto(listing as NonNullable<typeof listing>, {
      ticketPublicId: row.ticket.publicId,
      eventPublicId: row.event.publicId,
    });
  });
}

export async function withdrawListing(
  sellerId: string,
  listingPublicId: string,
  now: Date,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(resaleListings)
      .where(
        and(
          eq(resaleListings.publicId, listingPublicId),
          eq(resaleListings.sellerOxyAccountId, sellerId),
        ),
      )
      .for('update');
    if (!listing) throw notFound('Listing');
    if (listing.status !== 'active')
      throw new ApiException('conflict', 'This listing is already closed');
    await tx
      .update(resaleListings)
      .set({ status: 'withdrawn', updatedAt: now })
      .where(eq(resaleListings.id, listing.id));
    await tx
      .update(tickets)
      .set({ status: 'valid', updatedAt: now })
      .where(and(eq(tickets.id, listing.ticketId), eq(tickets.status, 'listed')));
  });
}

export async function listListingsForEvent(
  eventPublicId: string,
  db: Db = getDb(),
): Promise<ResaleListing[]> {
  const rows = await db
    .select({
      listing: resaleListings,
      ticketPublicId: tickets.publicId,
      eventPublicId: events.publicId,
    })
    .from(resaleListings)
    .innerJoin(tickets, eq(tickets.id, resaleListings.ticketId))
    .innerJoin(events, eq(events.id, resaleListings.eventId))
    .where(and(eq(events.publicId, eventPublicId), eq(resaleListings.status, 'active')))
    .orderBy(asc(resaleListings.priceAmount), asc(resaleListings.id))
    .limit(100);
  return rows.map((r) =>
    listingDto(r.listing, { ticketPublicId: r.ticketPublicId, eventPublicId: r.eventPublicId }),
  );
}

/**
 * Buy a listed ticket. The listing is closed and the ticket re-issued in one
 * transaction guarded on the listing still being active, so two buyers cannot
 * both get it, and the seller's old code dies with the version bump.
 */
export async function buyListing(
  buyerId: string,
  listingPublicId: string,
  holderName: string | undefined,
  now: Date,
  db: Db = getDb(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ listing: resaleListings, ticket: tickets, type: ticketTypes, event: events })
      .from(resaleListings)
      .innerJoin(tickets, eq(tickets.id, resaleListings.ticketId))
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .innerJoin(events, eq(events.id, resaleListings.eventId))
      .where(eq(resaleListings.publicId, listingPublicId))
      .for('update', { of: resaleListings });
    if (!row) throw notFound('Listing');
    if (row.listing.status !== 'active')
      throw new ApiException('gone', 'This ticket was already sold');
    if (row.listing.sellerOxyAccountId === buyerId) {
      throw new ApiException('validation_failed', 'You cannot buy your own ticket');
    }
    if (now >= row.event.startsAt) throw new ApiException('conflict', 'The event already started');
    if (row.type.named && !holderName) {
      throw new ApiException('validation_failed', 'This ticket is named: give the holder name');
    }
    const moved = await tx
      .update(tickets)
      .set({
        holderOxyAccountId: buyerId,
        holderName: row.type.named ? (holderName ?? null) : row.ticket.holderName,
        status: 'valid',
        codeVersion: sql`${tickets.codeVersion} + 1` as unknown as number,
        updatedAt: now,
      })
      .where(and(eq(tickets.id, row.ticket.id), eq(tickets.status, 'listed')))
      .returning({ id: tickets.id });
    if (moved.length === 0) throw new ApiException('gone', 'This ticket is no longer for sale');
    await tx
      .update(resaleListings)
      .set({ status: 'sold', buyerOxyAccountId: buyerId, updatedAt: now })
      .where(eq(resaleListings.id, row.listing.id));
    await tx.insert(ticketTransfers).values({
      ticketId: row.ticket.id,
      fromOxyAccountId: row.listing.sellerOxyAccountId,
      toOxyAccountId: buyerId,
      kind: 'resale',
      resaleListingId: row.listing.id,
    });
    return row.ticket.publicId;
  });
}
