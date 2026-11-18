import type { EventInput, TicketTypeInput } from '@vibbr.co/contracts';
import { createEvent, createOrganizer, createVenue, publishEvent } from '../services/catalog';
import { createTicketType } from '../services/ticketTypes';

let counter = 0;
export const next = () => ++counter;

export const NOW = new Date('2026-11-18T10:00:00.000Z');
export const EVENT_START = '2026-12-20T20:00:00.000Z';

export async function makeOrganizer(oxyAccountId = `owner-${next()}`) {
  return createOrganizer(oxyAccountId, {
    kind: 'artist',
    name: 'Test Artist',
    handle: `artist_${next()}_${Date.now() % 100000}`,
  });
}

export async function makeVenue(
  overrides: Partial<{ city: string; latitude: number; longitude: number }> = {},
) {
  return createVenue('owner', {
    name: 'Sala Test',
    addressLine: 'Calle 1',
    city: overrides.city ?? 'Madrid',
    region: null,
    countryCode: 'ES',
    timeZone: 'Europe/Madrid',
    location:
      overrides.latitude !== undefined && overrides.longitude !== undefined
        ? { latitude: overrides.latitude, longitude: overrides.longitude }
        : null,
    capacity: 500,
  });
}

export async function makePublishedEvent(
  organizerId: string,
  venueId: string,
  overrides: Partial<EventInput> = {},
) {
  const draft = await createEvent({
    organizerId: organizerId as EventInput['organizerId'],
    title: 'Concierto',
    category: 'music',
    tags: ['indie'],
    timeZone: 'Europe/Madrid',
    startsAt: EVENT_START,
    place: { mode: 'in_person', venueId: venueId as never, onlineUrl: null },
    lineup: [],
    ...overrides,
  });
  return publishEvent(draft.id, draft.revision);
}

export async function makeTicketType(eventId: string, overrides: Partial<TicketTypeInput> = {}) {
  const base: TicketTypeInput = {
    name: 'General',
    priceAmount: '2500',
    currency: 'EUR',
    paymentMode: 'door',
    quota: 10,
    perPersonLimit: 4,
    named: false,
    transferable: true,
    resellable: true,
    hidden: false,
    ...overrides,
  };
  return createTicketType(eventId, base);
}
