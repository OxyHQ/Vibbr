import { newPublicId, type TicketTypeInput } from '@vibbr.co/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type DatabaseOrTransaction, getDb } from '../db';
import { events, orderLines, ticketTypes } from '../db/schema';
import { ApiException, notFound } from '../utils/errors';
import { findEventRow } from './catalog';
import { ticketTypeDto } from './serialize';

type Db = DatabaseOrTransaction;

export async function findTicketTypeRow(publicId: string, db: Db = getDb()) {
  const [row] = await db.select().from(ticketTypes).where(eq(ticketTypes.publicId, publicId));
  if (!row) throw notFound('Ticket type');
  return row;
}

export async function createTicketType(
  eventPublicId: string,
  input: TicketTypeInput,
  db: Db = getDb(),
) {
  const { event } = await findEventRow(eventPublicId, db);
  if (event.status === 'cancelled' || event.status === 'ended') {
    throw new ApiException('conflict', 'This event no longer sells tickets');
  }
  const [row] = await db
    .insert(ticketTypes)
    .values({
      publicId: newPublicId('ticketType'),
      eventId: event.id,
      name: input.name,
      description: input.description ?? null,
      priceAmount: BigInt(input.priceAmount),
      currency: input.currency,
      paymentMode: input.paymentMode,
      quota: input.quota,
      perPersonLimit: input.perPersonLimit,
      salesStartAt: input.salesStartAt ? new Date(input.salesStartAt) : null,
      salesEndAt: input.salesEndAt ? new Date(input.salesEndAt) : null,
      named: input.named,
      transferable: input.transferable,
      resellable: input.resellable,
      resaleCapPercent: input.resaleCapPercent ?? null,
      hidden: input.hidden,
    })
    .returning();
  return ticketTypeDto(row as NonNullable<typeof row>, eventPublicId);
}

/**
 * The quota can be raised or lowered but never below what is already sold or
 * held; price, mode and currency are fixed once anything was sold, because
 * tickets already issued were bought on those terms.
 */
export async function updateTicketType(
  publicId: string,
  changes: Partial<
    Pick<
      TicketTypeInput,
      'name' | 'description' | 'quota' | 'salesStartAt' | 'salesEndAt' | 'hidden'
    >
  >,
  db: Db = getDb(),
) {
  const type = await findTicketTypeRow(publicId, db);
  if (changes.quota !== undefined && changes.quota < type.sold) {
    throw new ApiException('conflict', 'The quota cannot be lower than the tickets already sold');
  }
  const [row] = await db
    .update(ticketTypes)
    .set({
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.description !== undefined && { description: changes.description }),
      ...(changes.quota !== undefined && { quota: changes.quota }),
      ...(changes.salesStartAt !== undefined && {
        salesStartAt: changes.salesStartAt ? new Date(changes.salesStartAt) : null,
      }),
      ...(changes.salesEndAt !== undefined && {
        salesEndAt: changes.salesEndAt ? new Date(changes.salesEndAt) : null,
      }),
      ...(changes.hidden !== undefined && { hidden: changes.hidden }),
      updatedAt: new Date(),
    })
    .where(
      and(eq(ticketTypes.id, type.id), sql`${ticketTypes.sold} <= ${changes.quota ?? type.quota}`),
    )
    .returning();
  if (!row) throw new ApiException('conflict', 'The tickets sold changed; try again');
  const [owner] = await db
    .select({ publicId: events.publicId })
    .from(events)
    .where(eq(events.id, type.eventId));
  return ticketTypeDto(row, owner?.publicId ?? '');
}

export async function deleteTicketType(publicId: string, db: Db = getDb()): Promise<void> {
  const type = await findTicketTypeRow(publicId, db);
  const [used] = await db
    .select({ one: sql<number>`1` })
    .from(orderLines)
    .where(eq(orderLines.ticketTypeId, type.id))
    .limit(1);
  if (used)
    throw new ApiException(
      'conflict',
      'A ticket type with orders cannot be deleted; hide it instead',
    );
  await db.delete(ticketTypes).where(eq(ticketTypes.id, type.id));
}

export async function listTicketTypes(
  eventPublicId: string,
  includeHidden: boolean,
  db: Db = getDb(),
) {
  const { event } = await findEventRow(eventPublicId, db);
  const rows = await db
    .select()
    .from(ticketTypes)
    .where(
      includeHidden
        ? eq(ticketTypes.eventId, event.id)
        : and(eq(ticketTypes.eventId, event.id), eq(ticketTypes.hidden, false)),
    )
    .orderBy(asc(ticketTypes.priceAmount), asc(ticketTypes.id));
  return rows.map((row) => ticketTypeDto(row, event.publicId));
}
