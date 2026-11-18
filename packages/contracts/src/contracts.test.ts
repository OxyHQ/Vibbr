import { describe, expect, test } from 'bun:test';
import { EventInput, idSchema, Money, newPublicId, OrderInput, TicketTypeInput } from './index';

describe('ids', () => {
  test('a minted id parses as its own kind only', () => {
    const id = newPublicId('event');
    expect(idSchema('event').safeParse(id).success).toBe(true);
    expect(idSchema('ticket').safeParse(id).success).toBe(false);
    expect(idSchema('event').safeParse('evt_XYZ').success).toBe(false);
  });
});

describe('money', () => {
  test('is an integer string, never a float', () => {
    expect(Money.safeParse({ amount: '2500', currency: 'EUR' }).success).toBe(true);
    expect(Money.safeParse({ amount: '25.00', currency: 'EUR' }).success).toBe(false);
    expect(Money.safeParse({ amount: '-1', currency: 'EUR' }).success).toBe(false);
    expect(Money.safeParse({ amount: '100', currency: 'eur' }).success).toBe(false);
  });
});

const place = { mode: 'online', venueId: null, onlineUrl: 'https://example.com/live' } as const;
const base = {
  organizerId: newPublicId('organizer'),
  title: 'Show',
  category: 'music',
  timeZone: 'UTC',
  startsAt: '2026-12-01T20:00:00.000Z',
  place,
};

describe('events', () => {
  test('places must match their mode', () => {
    expect(EventInput.safeParse(base).success).toBe(true);
    expect(
      EventInput.safeParse({
        ...base,
        place: { mode: 'in_person', venueId: null, onlineUrl: null },
      }).success,
    ).toBe(false);
    expect(
      EventInput.safeParse({
        ...base,
        place: { mode: 'hybrid', venueId: newPublicId('venue'), onlineUrl: null },
      }).success,
    ).toBe(false);
  });
  test('an event cannot end before it starts', () => {
    expect(EventInput.safeParse({ ...base, endsAt: '2026-12-01T19:00:00.000Z' }).success).toBe(
      false,
    );
    expect(EventInput.safeParse({ ...base, endsAt: '2026-12-01T22:00:00.000Z' }).success).toBe(
      true,
    );
  });
});

describe('ticket types', () => {
  const type = { name: 'GA', priceAmount: '1000', currency: 'EUR', paymentMode: 'door', quota: 10 };
  test('free exactly when the price is zero', () => {
    expect(TicketTypeInput.safeParse(type).success).toBe(true);
    expect(TicketTypeInput.safeParse({ ...type, paymentMode: 'free' }).success).toBe(false);
    expect(TicketTypeInput.safeParse({ ...type, priceAmount: '0' }).success).toBe(false);
    expect(
      TicketTypeInput.safeParse({ ...type, priceAmount: '0', paymentMode: 'free' }).success,
    ).toBe(true);
  });
  test('rejects unknown fields', () => {
    expect(TicketTypeInput.safeParse({ ...type, surprise: true }).success).toBe(false);
  });
});

describe('orders', () => {
  test('needs at least one line and a known event id', () => {
    expect(OrderInput.safeParse({ eventId: newPublicId('event'), lines: [] }).success).toBe(false);
    expect(
      OrderInput.safeParse({
        eventId: newPublicId('event'),
        lines: [{ ticketTypeId: newPublicId('ticketType'), quantity: 2 }],
      }).success,
    ).toBe(true);
  });
});
