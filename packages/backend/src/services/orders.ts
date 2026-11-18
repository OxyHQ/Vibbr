import { type Order, type OrderInput, type PaymentChoice, newPublicId } from '@vibbr.co/contracts';
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { config } from '../config';
import { type DatabaseOrTransaction, type Transaction, getDb } from '../db';
import { events, orderLines, orders, ticketTypes, tickets } from '../db/schema';
import { type PaymentProvider, assertSupported } from '../payments/provider';
import { ApiException, notFound } from '../utils/errors';
import { orderDto, ticketDto } from './serialize';

type Db = DatabaseOrTransaction;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** A published event stops selling when it ends; with no end time, six hours after it starts. */
function saleDeadline(event: { startsAt: Date; endsAt: Date | null }): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + 6 * 3600 * 1000);
}

export interface ReserveOptions {
  readonly now: Date;
  readonly provider: PaymentProvider;
  /**
   * Quota a waitlist offer already holds, by ticket type id. It is already
   * counted in `sold`, so the reservation takes it over instead of counting again.
   */
  readonly held?: ReadonlyMap<number, number>;
}

function resolveChoice(
  mode: (typeof ticketTypes.$inferSelect)['paymentMode'],
  payWith: PaymentChoice | undefined,
): PaymentChoice {
  if (mode === 'choice') {
    if (payWith !== 'door' && payWith !== 'online') {
      throw new ApiException('validation_failed', 'Choose how to pay: at the door or online');
    }
    return payWith;
  }
  if (payWith !== undefined && payWith !== mode) {
    throw new ApiException('validation_failed', `This ticket is paid: ${mode}`);
  }
  return mode;
}

/**
 * Reserve (and, when nothing is paid online, immediately issue) tickets.
 *
 * Oversell is impossible by construction: the quota is taken with one guarded
 * UPDATE (`sold + n <= quota`), so two buyers cannot both win the last ticket,
 * and a loser's whole transaction rolls back. The same request retried with the
 * same idempotency key returns the first answer instead of buying twice.
 */
export async function reserveOrder(
  buyerId: string,
  input: OrderInput,
  idempotencyKey: string,
  options: ReserveOptions,
  db: Db = getDb(),
): Promise<Order> {
  try {
    return await db.transaction((tx) =>
      reserveInTransaction(tx, buyerId, input, idempotencyKey, options),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Lost a race with the same key: the winner's order is the answer.
    const existing = await findByIdempotencyKey(db, buyerId, idempotencyKey, requestHash(input));
    if (existing) return existing;
    throw error;
  }
}

/** Order of lines does not change what is bought, so it does not change the fingerprint. */
function requestHash(input: OrderInput): string {
  const lines = [...input.lines]
    .map((l) => ({
      t: l.ticketTypeId,
      q: l.quantity,
      p: l.payWith ?? null,
      h: l.holders?.map((x) => x.name) ?? null,
    }))
    .sort((a, b) => a.t.localeCompare(b.t));
  return createHash('sha256')
    .update(JSON.stringify([input.eventId, lines]))
    .digest('hex');
}

async function findByIdempotencyKey(
  db: Db,
  buyerId: string,
  key: string,
  hash: string,
): Promise<Order | null> {
  const [row] = await db
    .select({ id: orders.id, requestHash: orders.requestHash })
    .from(orders)
    .where(and(eq(orders.buyerOxyAccountId, buyerId), eq(orders.idempotencyKey, key)));
  if (!row) return null;
  if (row.requestHash !== hash) {
    throw new ApiException('conflict', 'That idempotency key was used for a different order');
  }
  return loadOrder(db, row.id);
}

async function reserveInTransaction(
  tx: Transaction,
  buyerId: string,
  input: OrderInput,
  idempotencyKey: string,
  { now, provider, held }: ReserveOptions,
): Promise<Order> {
  const hash = requestHash(input);
  const replay = await findByIdempotencyKey(tx, buyerId, idempotencyKey, hash);
  if (replay) return replay;

  // Lock the event row: it serialises event-level capacity checks and keeps the
  // event from being cancelled underneath a purchase.
  const [event] = await tx
    .select()
    .from(events)
    .where(eq(events.publicId, input.eventId))
    .for('update');
  if (!event) throw notFound('Event');
  if (event.status !== 'published')
    throw new ApiException('sale_closed', 'This event is not on sale');
  if (now >= saleDeadline(event)) throw new ApiException('sale_closed', 'This event is over');

  const typeIds = input.lines.map((l) => l.ticketTypeId);
  if (new Set(typeIds).size !== typeIds.length) {
    throw new ApiException('validation_failed', 'List each ticket type once');
  }

  const types = await tx
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, event.id), inArray(ticketTypes.publicId, typeIds)));
  const byPublicId = new Map(types.map((t) => [t.publicId, t]));

  const prepared = [];
  for (const line of input.lines) {
    const type = byPublicId.get(line.ticketTypeId);
    if (!type)
      throw new ApiException('validation_failed', 'Ticket type does not belong to this event');
    if (
      (type.salesStartAt && now < type.salesStartAt) ||
      (type.salesEndAt && now >= type.salesEndAt)
    ) {
      throw new ApiException('sale_closed', `${type.name} is not on sale right now`);
    }
    const choice = resolveChoice(type.paymentMode, line.payWith);
    assertSupported(provider, choice);
    if (type.named && line.holders?.length !== line.quantity) {
      throw new ApiException('validation_failed', `${type.name} needs one holder name per ticket`);
    }
    if (line.quantity > type.perPersonLimit) {
      throw new ApiException(
        'limit_exceeded',
        `At most ${type.perPersonLimit} of ${type.name} per person`,
      );
    }

    const [{ already }] = (await tx
      .select({ already: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int` })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.ticketTypeId, type.id),
          eq(orders.buyerOxyAccountId, buyerId),
          inArray(orders.status, ['reserved', 'confirmed']),
        ),
      )) as [{ already: number }];
    if (already + line.quantity > type.perPersonLimit) {
      throw new ApiException(
        'limit_exceeded',
        `At most ${type.perPersonLimit} of ${type.name} per person`,
      );
    }

    const holdsAlready = held?.get(type.id) ?? 0;
    if (holdsAlready !== 0 && holdsAlready !== line.quantity) {
      throw new ApiException('conflict', 'The held quantity does not match the order');
    }
    if (holdsAlready === 0) {
      const taken = await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} + ${line.quantity}` })
        .where(
          and(
            eq(ticketTypes.id, type.id),
            sql`${ticketTypes.sold} + ${line.quantity} <= ${ticketTypes.quota}`,
          ),
        )
        .returning({ id: ticketTypes.id });
      if (taken.length === 0) throw new ApiException('sold_out', `${type.name} is sold out`);
    }
    prepared.push({ type, line, choice });
  }

  if (event.capacity !== null) {
    const [{ total }] = (await tx
      .select({ total: sql<number>`coalesce(sum(${ticketTypes.sold}), 0)::int` })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, event.id))) as [{ total: number }];
    if (total > event.capacity) throw new ApiException('sold_out', 'The event is at capacity');
  }

  const currencies = new Set(prepared.map((p) => p.type.currency));
  if (currencies.size > 1) throw new ApiException('validation_failed', 'One currency per order');
  const currency = prepared[0]?.type.currency ?? null;
  const total = prepared.reduce((sum, p) => sum + p.type.priceAmount * BigInt(p.line.quantity), 0n);
  const hasOnline = prepared.some((p) => p.choice === 'online');

  const [order] = await tx
    .insert(orders)
    .values({
      publicId: newPublicId('order'),
      eventId: event.id,
      buyerOxyAccountId: buyerId,
      status: hasOnline ? 'reserved' : 'confirmed',
      expiresAt: hasOnline ? new Date(now.getTime() + config.reservationMinutes * 60_000) : null,
      totalAmount: total,
      currency,
      paymentStatus: total === 0n ? 'not_required' : hasOnline ? 'pending' : 'not_collected',
      idempotencyKey,
      requestHash: hash,
    })
    .returning();
  const created = order as NonNullable<typeof order>;

  for (const { type, line, choice } of prepared) {
    await tx.insert(orderLines).values({
      orderId: created.id,
      ticketTypeId: type.id,
      quantity: line.quantity,
      unitAmount: type.priceAmount,
      currency: type.currency,
      paymentChoice: choice,
      holderNames: line.holders?.map((h) => h.name) ?? null,
    });
    if (!hasOnline) {
      await tx.insert(tickets).values(
        Array.from({ length: line.quantity }, (_, index) => ({
          publicId: newPublicId('ticket'),
          orderId: created.id,
          eventId: event.id,
          ticketTypeId: type.id,
          holderOxyAccountId: buyerId,
          holderName: line.holders?.[index]?.name ?? null,
          status: 'valid' as const,
          paymentChoice: choice,
          paymentStatus: choice === 'free' ? ('not_required' as const) : ('not_collected' as const),
        })),
      );
    }
  }
  return loadOrder(tx, created.id);
}

export async function loadOrder(db: Db, orderId: number): Promise<Order> {
  const [row] = await db
    .select({ order: orders, eventPublicId: events.publicId })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .where(eq(orders.id, orderId));
  if (!row) throw notFound('Order');
  const ticketRows = await db
    .select({ ticket: tickets, typePublicId: ticketTypes.publicId })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.orderId, orderId))
    .orderBy(tickets.id);
  return orderDto(
    row.order,
    row.eventPublicId,
    ticketRows.map((t) =>
      ticketDto(t.ticket, {
        orderPublicId: row.order.publicId,
        eventPublicId: row.eventPublicId,
        ticketTypePublicId: t.typePublicId,
      }),
    ),
  );
}

export async function getOrderFor(
  buyerId: string,
  publicId: string,
  db: Db = getDb(),
): Promise<Order> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.publicId, publicId), eq(orders.buyerOxyAccountId, buyerId)));
  // Another person's order is "not found", not "forbidden": it does not exist for them.
  if (!row) throw notFound('Order');
  return loadOrder(db, row.id);
}

export async function listOrdersFor(buyerId: string, db: Db = getDb()): Promise<Order[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.buyerOxyAccountId, buyerId))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(100);
  return Promise.all(rows.map((r) => loadOrder(db, r.id)));
}

/** Returns the ticket types whose quota was released, so the caller can offer it to the waitlist. */
async function releaseOrder(
  tx: Transaction,
  orderId: number,
  finalStatus: 'cancelled' | 'expired',
): Promise<number[]> {
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  for (const line of lines) {
    await tx
      .update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} - ${line.quantity}` })
      .where(eq(ticketTypes.id, line.ticketTypeId));
  }
  await tx
    .update(tickets)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(tickets.orderId, orderId));
  await tx
    .update(orders)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  return [...new Set(lines.map((l) => l.ticketTypeId))];
}

/**
 * Cancel a whole order before the event, while every ticket is still unused and
 * still with the buyer. A ticket that was transferred, listed or scanned makes
 * the order not cancellable as a whole.
 */
export async function cancelOrder(
  buyerId: string,
  publicId: string,
  now: Date,
  db: Db = getDb(),
): Promise<number[]> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.publicId, publicId), eq(orders.buyerOxyAccountId, buyerId)))
      .for('update');
    if (!order) throw notFound('Order');
    if (order.status !== 'reserved' && order.status !== 'confirmed') {
      throw new ApiException('conflict', 'This order can no longer be cancelled');
    }
    const [event] = await tx.select().from(events).where(eq(events.id, order.eventId));
    if (event && now >= event.startsAt)
      throw new ApiException('conflict', 'The event already started');
    const ticketRows = await tx.select().from(tickets).where(eq(tickets.orderId, order.id));
    if (ticketRows.some((t) => t.status !== 'valid' || t.holderOxyAccountId !== buyerId)) {
      throw new ApiException('conflict', 'Some tickets were transferred, listed or used');
    }
    return releaseOrder(tx, order.id, 'cancelled');
  });
}

/** Frees the quota of unpaid online reservations whose time ran out. Safe to run concurrently. */
export async function expireReservations(now: Date, db: Db = getDb()): Promise<number[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'reserved'), lte(orders.expiresAt, now)))
      .limit(100)
      .for('update', { skipLocked: true });
    const released: number[] = [];
    for (const { id } of due) released.push(...(await releaseOrder(tx, id, 'expired')));
    return [...new Set(released)];
  });
}

/** Cancelling an event cancels every open order of it and releases nothing to the waitlist. */
export async function cancelEventOrders(eventId: number, tx: Transaction): Promise<void> {
  const open = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), inArray(orders.status, ['reserved', 'confirmed'])));
  for (const { id } of open) await releaseOrder(tx, id, 'cancelled');
}
