import type { Ticket, TicketCode } from '@vibbr.co/contracts';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../config';
import { type DatabaseOrTransaction, getDb } from '../db';
import {
  events,
  orders,
  resaleListings,
  ticketTransfers,
  ticketTypes,
  tickets,
} from '../db/schema';
import { mintTicketCode } from '../security/ticketCode';
import { ApiException, notFound } from '../utils/errors';
import { ticketDto } from './serialize';

type Db = DatabaseOrTransaction;

const TICKET_COLUMNS = {
  ticket: tickets,
  orderPublicId: orders.publicId,
  eventPublicId: events.publicId,
  typePublicId: ticketTypes.publicId,
} as const;

function toDto(row: {
  ticket: typeof tickets.$inferSelect;
  orderPublicId: string;
  eventPublicId: string;
  typePublicId: string;
}): Ticket {
  return ticketDto(row.ticket, {
    orderPublicId: row.orderPublicId,
    eventPublicId: row.eventPublicId,
    ticketTypePublicId: row.typePublicId,
  });
}

function selectTickets(db: Db) {
  return db
    .select(TICKET_COLUMNS)
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId));
}

/** A person's tickets that can still be used or passed on. */
export async function listTicketsFor(holderId: string, db: Db = getDb()): Promise<Ticket[]> {
  const rows = await selectTickets(db)
    .where(
      and(
        eq(tickets.holderOxyAccountId, holderId),
        inArray(tickets.status, ['valid', 'used', 'listed']),
      ),
    )
    .orderBy(desc(tickets.createdAt), desc(tickets.id))
    .limit(200);
  return rows.map(toDto);
}

export async function getTicketFor(
  holderId: string,
  publicId: string,
  db: Db = getDb(),
): Promise<Ticket> {
  const [row] = await selectTickets(db).where(
    and(eq(tickets.publicId, publicId), eq(tickets.holderOxyAccountId, holderId)),
  );
  if (!row) throw notFound('Ticket');
  return toDto(row);
}

/** The code is minted for the holder only, and only for a ticket that can still be used. */
export async function mintCodeFor(
  holderId: string,
  publicId: string,
  now: Date,
  db: Db = getDb(),
): Promise<TicketCode> {
  const [row] = await db
    .select({ ticket: tickets })
    .from(tickets)
    .where(and(eq(tickets.publicId, publicId), eq(tickets.holderOxyAccountId, holderId)));
  if (!row) throw notFound('Ticket');
  if (row.ticket.status !== 'valid' && row.ticket.status !== 'listed') {
    throw new ApiException('gone', 'This ticket can no longer be used');
  }
  const { code, expiresAt } = mintTicketCode(
    config.ticketCodeSecret(),
    publicId,
    row.ticket.codeVersion,
    now,
  );
  return { ticketId: publicId as TicketCode['ticketId'], code, expiresAt: expiresAt.toISOString() };
}

/**
 * Hand a ticket to another person. The holder changes and `codeVersion` goes up
 * in one UPDATE guarded on the old holder and the old version, so a transfer
 * racing a scan or a second transfer cannot both win; every code minted for the
 * previous holder stops verifying the instant it commits.
 */
export async function transferTicket(
  fromId: string,
  publicId: string,
  toId: string,
  holderName: string | undefined,
  now: Date,
  db: Db = getDb(),
): Promise<Ticket> {
  if (fromId === toId) throw new ApiException('validation_failed', 'Choose someone else');
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ ticket: tickets, type: ticketTypes, event: events })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(and(eq(tickets.publicId, publicId), eq(tickets.holderOxyAccountId, fromId)))
      .for('update', { of: tickets });
    if (!row) throw notFound('Ticket');
    if (row.ticket.status !== 'valid') {
      throw new ApiException(
        'conflict',
        'Only an unused ticket that is not for sale can be transferred',
      );
    }
    if (!row.type.transferable)
      throw new ApiException('conflict', 'This ticket cannot be transferred');
    if (now >= row.event.startsAt) throw new ApiException('conflict', 'The event already started');
    if (row.type.named && !holderName) {
      throw new ApiException('validation_failed', 'This ticket is named: give the new holder name');
    }
    const updated = await tx
      .update(tickets)
      .set({
        holderOxyAccountId: toId,
        holderName: row.type.named ? (holderName ?? null) : row.ticket.holderName,
        codeVersion: sql`${tickets.codeVersion} + 1` as unknown as number,
        updatedAt: now,
      })
      .where(
        and(
          eq(tickets.id, row.ticket.id),
          eq(tickets.holderOxyAccountId, fromId),
          eq(tickets.codeVersion, row.ticket.codeVersion),
          eq(tickets.status, 'valid'),
        ),
      )
      .returning({ id: tickets.id });
    if (updated.length === 0) throw new ApiException('conflict', 'The ticket changed; try again');
    await tx.insert(ticketTransfers).values({
      ticketId: row.ticket.id,
      fromOxyAccountId: fromId,
      toOxyAccountId: toId,
      kind: 'transfer',
    });
  });
  // The ticket now belongs to the recipient; the sender can no longer read it.
  return getTicketFor(toId, publicId, db);
}

export { resaleListings };
