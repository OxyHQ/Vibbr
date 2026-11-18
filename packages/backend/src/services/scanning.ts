import type { ScanResult } from '@vibbr.co/contracts';
import { and, eq } from 'drizzle-orm';
import { config } from '../config';
import { type DatabaseOrTransaction, type Transaction, getDb } from '../db';
import { checkins, events, resaleListings, ticketTypes, tickets } from '../db/schema';
import { verifyTicketCode } from '../security/ticketCode';
import { notFound } from '../utils/errors';

type Db = DatabaseOrTransaction;

const empty = (result: ScanResult['result']): ScanResult => ({
  result,
  ticketId: null,
  holderName: null,
  ticketTypeName: null,
});

/**
 * One door scan, as of `scannedAt` (an offline scanner replays old instants).
 *
 * Admission is a single UPDATE guarded on `status = 'valid'`: of two scanners
 * reading the same ticket at once exactly one gets a row back, the other is
 * told "already used". Every outcome is logged, including the refusals.
 */
export async function scanTicket(
  scannerId: string,
  eventPublicId: string,
  code: string,
  scannedAt: Date,
  db: Db = getDb(),
): Promise<ScanResult> {
  const [event] = await db.select().from(events).where(eq(events.publicId, eventPublicId));
  if (!event) throw notFound('Event');

  const log = (result: ScanResult['result'], ticketId: number | null) =>
    db.insert(checkins).values({
      eventId: event.id,
      ticketId,
      scannerOxyAccountId: scannerId,
      result,
      scannedAt,
    });

  const check = verifyTicketCode(config.ticketCodeSecret(), code, scannedAt);
  if (!check.ok) {
    const result = check.reason === 'expired' ? 'expired_code' : 'invalid';
    await log(result, null);
    return empty(result);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ ticket: tickets, typeName: ticketTypes.name })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .where(eq(tickets.publicId, check.ticketId))
      .for('update', { of: tickets });
    if (!row || row.ticket.codeVersion !== check.codeVersion) {
      await tx.insert(checkins).values({
        eventId: event.id,
        ticketId: null,
        scannerOxyAccountId: scannerId,
        result: 'invalid',
        scannedAt,
      });
      return empty('invalid');
    }
    const answer = (result: ScanResult['result']): ScanResult => ({
      result,
      ticketId: row.ticket.publicId as ScanResult['ticketId'],
      holderName: row.ticket.holderName,
      ticketTypeName: row.typeName,
    });
    const record = (result: ScanResult['result']) =>
      tx.insert(checkins).values({
        eventId: event.id,
        ticketId: row.ticket.id,
        scannerOxyAccountId: scannerId,
        result,
        scannedAt,
      });

    if (row.ticket.eventId !== event.id) {
      await record('wrong_event');
      return answer('wrong_event');
    }
    if (row.ticket.status === 'cancelled') {
      await record('cancelled');
      return answer('cancelled');
    }
    if (row.ticket.status === 'used') {
      await record('already_used');
      return answer('already_used');
    }

    const admitted = await tx
      .update(tickets)
      .set({ status: 'used', checkedInAt: scannedAt, updatedAt: new Date() })
      .where(and(eq(tickets.id, row.ticket.id), eq(tickets.codeVersion, check.codeVersion)))
      .returning({ id: tickets.id });
    if (admitted.length === 0) {
      await record('already_used');
      return answer('already_used');
    }
    await closeListing(tx, row.ticket.id);
    await record('admitted');
    return answer('admitted');
  });
}

/** A ticket that gets someone in is no longer for sale. */
async function closeListing(tx: Transaction, ticketId: number): Promise<void> {
  await tx
    .update(resaleListings)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(and(eq(resaleListings.ticketId, ticketId), eq(resaleListings.status, 'active')));
}

/**
 * Replays scans recorded while the scanner was offline, oldest first, so the
 * first read of a ticket wins and a later duplicate is reported as such.
 */
export async function scanBatch(
  scannerId: string,
  eventPublicId: string,
  scans: ReadonlyArray<{ code: string; scannedAt: string }>,
  db: Db = getDb(),
): Promise<ScanResult[]> {
  const ordered = scans
    .map((scan, index) => ({ ...scan, index }))
    .sort((a, b) => Date.parse(a.scannedAt) - Date.parse(b.scannedAt) || a.index - b.index);
  const results = new Array<ScanResult>(scans.length);
  for (const scan of ordered) {
    results[scan.index] = await scanTicket(
      scannerId,
      eventPublicId,
      scan.code,
      new Date(scan.scannedAt),
      db,
    );
  }
  return results;
}
