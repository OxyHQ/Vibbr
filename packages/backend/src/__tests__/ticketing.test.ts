import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ErrorCode, OrderInput } from '@vibbr.co/contracts';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { ticketTypes } from '../db/schema';
import { noCollectionProvider } from '../payments/provider';
import { listEvents, cancelEvent, patchEvent, getEvent, endPastEvents } from '../services/catalog';
import { cancelOrder, expireReservations, reserveOrder } from '../services/orders';
import { buyListing, createListing, withdrawListing } from '../services/resale';
import { scanTicket } from '../services/scanning';
import { mintCodeFor, transferTicket } from '../services/tickets';
import { claimOffer, expireOffers, joinWaitlist, promoteWaitlist } from '../services/waitlist';
import { createTestDatabase, TEST_DATABASE_URL } from '../testing/database';
import {
  makeOrganizer,
  makePublishedEvent,
  makeTicketType,
  makeVenue,
  NOW,
} from '../testing/fixtures';
import { ApiException } from '../utils/errors';
import { must } from '../testing/must';
import { findTicketTypeRow } from '../services/ticketTypes';

const options = { now: NOW, provider: noCollectionProvider };
const order = (
  eventId: string,
  ticketTypeId: string,
  quantity: number,
  payWith?: 'door' | 'online',
): OrderInput => ({
  eventId: eventId as OrderInput['eventId'],
  lines: [{ ticketTypeId: ticketTypeId as never, quantity, ...(payWith && { payWith }) }],
});
const fails = async (promise: Promise<unknown>, code: ErrorCode) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).code).toBe(code);
};

describe.skipIf(!TEST_DATABASE_URL)('ticketing (real Postgres)', () => {
  let drop: () => Promise<void>;
  let eventId: string;
  let organizerId: string;
  let venueId: string;

  beforeAll(async () => {
    ({ drop } = await createTestDatabase());
    organizerId = (await makeOrganizer()).id;
    venueId = (await makeVenue({ latitude: 40.4168, longitude: -3.7038 })).id;
    eventId = (await makePublishedEvent(organizerId, venueId)).id;
  });
  afterAll(async () => {
    await drop?.();
  });

  test('a free event ticket is issued at once; a door ticket is confirmed with nothing collected', async () => {
    const free = await makeTicketType(eventId, {
      name: 'Free',
      priceAmount: '0',
      paymentMode: 'free',
      quota: 5,
    });
    const placed = await reserveOrder(
      'buyer-free',
      order(eventId, free.id, 2),
      'key-free-0001',
      options,
    );
    expect(placed.status).toBe('confirmed');
    expect(placed.paymentStatus).toBe('not_required');
    expect(placed.tickets).toHaveLength(2);

    const door = await makeTicketType(eventId, { name: 'Door', paymentMode: 'door' });
    const paid = await reserveOrder(
      'buyer-door',
      order(eventId, door.id, 1),
      'key-door-0001',
      options,
    );
    expect(paid.paymentStatus).toBe('not_collected');
    expect(paid.totalAmount).toBe('2500');
  });

  test('never oversells under concurrent buyers', async () => {
    const scarce = await makeTicketType(eventId, { name: 'Scarce', quota: 3, perPersonLimit: 1 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        reserveOrder(`rush-${i}`, order(eventId, scarce.id, 1), `rush-key-${i}-00`, options),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => (r.reason as ApiException).code === 'sold_out')).toBe(true);
    const row = await findTicketTypeRow(scarce.id);
    expect(row.sold).toBe(3);
  });

  test('the same idempotency key buys once', async () => {
    const type = await makeTicketType(eventId, { name: 'Idem', quota: 5 });
    const first = await reserveOrder(
      'idem-buyer',
      order(eventId, type.id, 1),
      'idem-key-0001',
      options,
    );
    const second = await reserveOrder(
      'idem-buyer',
      order(eventId, type.id, 1),
      'idem-key-0001',
      options,
    );
    expect(second.id).toBe(first.id);
    expect((await findTicketTypeRow(type.id)).sold).toBe(1);
    await fails(
      reserveOrder(
        'idem-buyer',
        order(eventId, (await makeTicketType(eventId)).id, 1),
        'idem-key-0001',
        options,
      ),
      'conflict',
    );
  });

  test('enforces the per-person limit across orders', async () => {
    const type = await makeTicketType(eventId, { name: 'Limited', quota: 10, perPersonLimit: 2 });
    await reserveOrder('limit-buyer', order(eventId, type.id, 2), 'limit-key-0001', options);
    await fails(
      reserveOrder('limit-buyer', order(eventId, type.id, 1), 'limit-key-0002', options),
      'limit_exceeded',
    );
  });

  test('online payment is refused while only the no-collection rail exists', async () => {
    const online = await makeTicketType(eventId, { name: 'Online', paymentMode: 'online' });
    await fails(
      reserveOrder('pay-buyer', order(eventId, online.id, 1), 'pay-key-00001', options),
      'payment_unavailable',
    );
    expect((await findTicketTypeRow(online.id)).sold).toBe(0);
    const choice = await makeTicketType(eventId, { name: 'Choice', paymentMode: 'choice' });
    await fails(
      reserveOrder('pay-buyer', order(eventId, choice.id, 1), 'pay-key-00002', options),
      'validation_failed',
    );
    const atDoor = await reserveOrder(
      'pay-buyer',
      order(eventId, choice.id, 1, 'door'),
      'pay-key-00003',
      options,
    );
    expect(atDoor.tickets[0]?.paymentChoice).toBe('door');
  });

  test('a named ticket type needs a holder name per ticket', async () => {
    const named = await makeTicketType(eventId, { name: 'Named', named: true });
    await fails(
      reserveOrder('named-buyer', order(eventId, named.id, 1), 'named-key-0001', options),
      'validation_failed',
    );
  });

  test('transfer re-issues the ticket and kills the old code', async () => {
    const type = await makeTicketType(eventId, { name: 'Transfer' });
    const placed = await reserveOrder(
      'seller-t',
      order(eventId, type.id, 1),
      'transfer-key-01',
      options,
    );
    const ticketId = must(placed.tickets[0]).id;
    const before = await mintCodeFor('seller-t', ticketId, NOW);
    await transferTicket('seller-t', ticketId, 'friend-t', undefined, NOW);
    await fails(mintCodeFor('seller-t', ticketId, NOW), 'not_found');
    const result = await scanTicket('door', eventId, before.code, NOW);
    expect(result.result).toBe('invalid');
    const fresh = await mintCodeFor('friend-t', ticketId, NOW);
    expect((await scanTicket('door', eventId, fresh.code, NOW)).result).toBe('admitted');
  });

  test('scanning admits once and reports the second read', async () => {
    const type = await makeTicketType(eventId, { name: 'Scan' });
    const placed = await reserveOrder(
      'scan-buyer',
      order(eventId, type.id, 1),
      'scan-key-00001',
      options,
    );
    const { code } = await mintCodeFor('scan-buyer', must(placed.tickets[0]).id, NOW);
    const [a, b] = await Promise.all([
      scanTicket('door-1', eventId, code, NOW),
      scanTicket('door-2', eventId, code, NOW),
    ]);
    expect([a.result, b.result].sort()).toEqual(['admitted', 'already_used']);
    expect((await scanTicket('door-1', eventId, 'v1.garbage', NOW)).result).toBe('invalid');
    const old = new Date(NOW.getTime() + 10 * 60_000);
    const stale = await mintCodeFor('scan-buyer', must(placed.tickets[0]).id, NOW).catch(
      () => null,
    );
    expect(stale).toBeNull();
    expect((await scanTicket('door-1', eventId, code, old)).result).toBe('expired_code');
  });

  test('resale respects the cap, closes on sale, and the seller keeps nothing', async () => {
    const type = await makeTicketType(eventId, {
      name: 'Resale',
      priceAmount: '2000',
      resaleCapPercent: 110,
    });
    const placed = await reserveOrder(
      'rs-seller',
      order(eventId, type.id, 1),
      'resale-key-001',
      options,
    );
    const ticketId = must(placed.tickets[0]).id;
    await fails(createListing('rs-seller', ticketId, '2201', NOW), 'validation_failed');
    const listing = await createListing('rs-seller', ticketId, '2200', NOW);
    await fails(buyListing('rs-seller', listing.id, undefined, NOW), 'validation_failed');
    const [one, two] = await Promise.allSettled([
      buyListing('rs-buyer-1', listing.id, undefined, NOW),
      buyListing('rs-buyer-2', listing.id, undefined, NOW),
    ]);
    expect([one.status, two.status].sort()).toEqual(['fulfilled', 'rejected']);
    await fails(mintCodeFor('rs-seller', ticketId, NOW), 'not_found');
  });

  test('a listing can be withdrawn and the ticket is valid again', async () => {
    const type = await makeTicketType(eventId, { name: 'Withdraw', priceAmount: '1000' });
    const placed = await reserveOrder(
      'wd-seller',
      order(eventId, type.id, 1),
      'withdraw-key-01',
      options,
    );
    const listing = await createListing('wd-seller', must(placed.tickets[0]).id, '1000', NOW);
    await withdrawListing('wd-seller', listing.id, NOW);
    expect((await mintCodeFor('wd-seller', must(placed.tickets[0]).id, NOW)).code).toContain('v1.');
  });

  test('cancelling an order frees the quota and the waitlist gets it, claimable once', async () => {
    const type = await makeTicketType(eventId, { name: 'Waitlist', quota: 1, perPersonLimit: 1 });
    const typeRow = await findTicketTypeRow(type.id);
    const held = await reserveOrder(
      'wl-holder',
      order(eventId, type.id, 1),
      'wl-holder-key-1',
      options,
    );
    await fails(
      reserveOrder('wl-other', order(eventId, type.id, 1), 'wl-other-key-01', options),
      'sold_out',
    );
    const entry = await joinWaitlist('wl-waiting', type.id, 1);
    expect(entry.position).toBe(1);

    const released = await cancelOrder('wl-holder', held.id, NOW);
    await promoteWaitlist(released, NOW);
    // The tickets are held for the person waiting, so a stranger cannot take them.
    await fails(
      reserveOrder('wl-stranger', order(eventId, type.id, 1), 'wl-stranger-k-1', options),
      'sold_out',
    );

    const claimed = await claimOffer('wl-waiting', entry.id, 'wl-claim-key-01', options);
    expect(claimed.tickets).toHaveLength(1);
    const again = await claimOffer('wl-waiting', entry.id, 'wl-claim-key-01', options);
    expect(again.id).toBe(claimed.id);
    expect((await findTicketTypeRow(type.id)).sold).toBe(typeRow.sold + 1);
  });

  test('an unclaimed offer expires and passes to the next person', async () => {
    const type = await makeTicketType(eventId, { name: 'Expiry', quota: 1, perPersonLimit: 1 });
    const held = await reserveOrder(
      'ex-holder',
      order(eventId, type.id, 1),
      'ex-holder-key-1',
      options,
    );
    const first = await joinWaitlist('ex-first', type.id, 1);
    await joinWaitlist('ex-second', type.id, 1);
    await promoteWaitlist(await cancelOrder('ex-holder', held.id, NOW), NOW);
    const later = new Date(NOW.getTime() + 30 * 60_000);
    await expireOffers(later);
    await fails(
      claimOffer('ex-first', first.id, 'ex-claim-key-01', { ...options, now: later }),
      'gone',
    );
    expect((await findTicketTypeRow(type.id)).sold).toBe(1);
  });

  test('event edits are refused against a stale revision', async () => {
    const event = await getEvent(eventId);
    await patchEvent(eventId, { revision: event.revision, changes: { title: 'Nuevo título' } });
    await fails(
      patchEvent(eventId, { revision: event.revision, changes: { title: 'Otro' } }),
      'revision_conflict',
    );
    expect((await getEvent(eventId)).title).toBe('Nuevo título');
  });

  test('discovery filters by city, category, text, price and distance, and pages by cursor', async () => {
    const lisbon = await makeVenue({ city: 'Lisboa', latitude: 38.7223, longitude: -9.1393 });
    const a = await makePublishedEvent(organizerId, lisbon.id, {
      title: 'Fado Night',
      category: 'music',
      startsAt: '2027-01-10T20:00:00.000Z',
    });
    await makeTicketType(a.id, { name: 'Entry', priceAmount: '1500' });
    const b = await makePublishedEvent(organizerId, lisbon.id, {
      title: 'Free Yoga',
      category: 'community',
      startsAt: '2027-01-11T10:00:00.000Z',
    });
    await makeTicketType(b.id, { name: 'Free', priceAmount: '0', paymentMode: 'free' });

    const base = { radiusKm: 50, limit: 20 } as const;
    const byCity = await listEvents({ ...base, city: 'Lisboa' }, NOW);
    expect(byCity.items.map((e) => e.title).sort()).toEqual(['Fado Night', 'Free Yoga']);
    expect((await listEvents({ ...base, q: 'fado' }, NOW)).items).toHaveLength(1);
    expect(
      (await listEvents({ ...base, category: 'community', city: 'Lisboa' }, NOW)).items[0]?.free,
    ).toBe(true);
    expect(
      (await listEvents({ ...base, free: 'true', city: 'Lisboa' }, NOW)).items.map((e) => e.title),
    ).toEqual(['Free Yoga']);
    expect(
      (await listEvents({ ...base, free: 'false', city: 'Lisboa' }, NOW)).items.map((e) => e.title),
    ).toEqual(['Fado Night']);
    expect(
      (await listEvents({ ...base, near: '38.72,-9.14', radiusKm: 10 }, NOW)).items,
    ).toHaveLength(2);
    expect(
      (await listEvents({ ...base, near: '40.41,-3.70', radiusKm: 10, city: 'Lisboa' }, NOW)).items,
    ).toHaveLength(0);

    const page1 = await listEvents({ ...base, limit: 1, city: 'Lisboa' }, NOW);
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listEvents(
      { ...base, limit: 1, city: 'Lisboa', cursor: must(page1.nextCursor) },
      NOW,
    );
    expect(page2.items[0]?.title).not.toBe(page1.items[0]?.title);
    expect(page2.nextCursor).toBeNull();
  });

  test('cancelling an event cancels its orders and frees the quota', async () => {
    const ev = await makePublishedEvent(organizerId, venueId, { title: 'To cancel' });
    const type = await makeTicketType(ev.id, { name: 'C', quota: 3 });
    const placed = await reserveOrder(
      'cx-buyer',
      order(ev.id, type.id, 2),
      'cancel-key-0001',
      options,
    );
    await cancelEvent(ev.id, NOW);
    expect((await getEvent(ev.id)).status).toBe('cancelled');
    expect((await findTicketTypeRow(type.id)).sold).toBe(0);
    await fails(
      reserveOrder('cx-late', order(ev.id, type.id, 1), 'cancel-key-0002', options),
      'sale_closed',
    );
    expect(placed.tickets).toHaveLength(2);
  });

  test('event capacity caps the total across ticket types', async () => {
    const ev = await makePublishedEvent(organizerId, venueId, { title: 'Tiny room', capacity: 3 });
    const a = await makeTicketType(ev.id, { name: 'A', quota: 5, perPersonLimit: 5 });
    const b = await makeTicketType(ev.id, { name: 'B', quota: 5, perPersonLimit: 5 });
    await reserveOrder('cap-1', order(ev.id, a.id, 2), 'capacity-key-01', options);
    await fails(
      reserveOrder('cap-2', order(ev.id, b.id, 2), 'capacity-key-02', options),
      'sold_out',
    );
    expect((await findTicketTypeRow(b.id)).sold).toBe(0);
  });

  test('sold never exceeds the quota at the database level', async () => {
    const type = await makeTicketType(eventId, { name: 'Guard', quota: 2 });
    const error = await getDb()
      .update(ticketTypes)
      .set({ sold: 3 })
      .where(eq(ticketTypes.publicId, type.id))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).not.toBeNull();
  });

  test('a finished event is marked ended', async () => {
    const ev = await makePublishedEvent(organizerId, venueId, {
      title: 'Past',
      startsAt: '2027-02-01T20:00:00.000Z',
    });
    expect(await endPastEvents(NOW)).toBe(0);
    expect(await endPastEvents(new Date('2027-02-02T20:00:00.000Z'))).toBeGreaterThanOrEqual(1);
    expect((await getEvent(ev.id)).status).toBe('ended');
    expect(await expireReservations(NOW)).toEqual([]);
  });
});
