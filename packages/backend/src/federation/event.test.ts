import { describe, expect, test } from 'bun:test';
import type { Event, Venue } from '@vibbr.co/contracts';
import { toActivityPubEvent, toEventAnnouncementNote } from './event';

const ctx = { origin: 'https://vibbr.co' };
const ID = `evt_${'a'.repeat(24)}`;

const base: Event = {
  id: ID as Event['id'],
  organizerId: `org_${'b'.repeat(24)}` as Event['organizerId'],
  title: 'Fado Night',
  summary: 'Live fado',
  description: 'An evening of fado.',
  category: 'music',
  tags: [],
  status: 'published',
  timeZone: 'Europe/Lisbon',
  startsAt: '2027-01-10T20:00:00.000Z',
  endsAt: '2027-01-10T23:00:00.000Z',
  place: { mode: 'in_person', venueId: `ven_${'c'.repeat(24)}` as never, onlineUrl: null },
  capacity: null,
  coverUrl: null,
  ageMinimum: null,
  lineup: [],
  revision: 3,
  publishedAt: '2026-11-18T10:00:00.000Z',
  url: `https://vibbr.co/e/${ID}` as Event['url'],
};

const venue: Venue = {
  id: `ven_${'c'.repeat(24)}` as Venue['id'],
  name: 'Clube de Fado',
  addressLine: 'Rua 1',
  city: 'Lisboa',
  region: null,
  countryCode: 'PT',
  timeZone: 'Europe/Lisbon',
  location: { latitude: 38.7, longitude: -9.1 },
  capacity: null,
};

describe('ActivityPub event projection', () => {
  test('a published event becomes a Mobilizon-shaped Event', () => {
    const event = toActivityPubEvent(ctx, base, { handle: 'fado_club' }, venue);
    expect(event).toMatchObject({
      id: `https://vibbr.co/ap/events/${ID}`,
      type: 'Event',
      name: 'Fado Night',
      startTime: base.startsAt,
      endTime: base.endsAt,
      timezone: 'Europe/Lisbon',
      status: 'CONFIRMED',
      joinMode: 'external',
      url: base.url,
      attributedTo: 'https://vibbr.co/ap/actors/fado_club',
      location: { type: 'Place', name: 'Clube de Fado', latitude: 38.7, longitude: -9.1 },
    });
  });

  test('a cancelled event says so; a draft has no projection', () => {
    expect(
      toActivityPubEvent(ctx, { ...base, status: 'cancelled' }, { handle: 'x_y_z' }, venue).status,
    ).toBe('CANCELLED');
    expect(() =>
      toActivityPubEvent(ctx, { ...base, status: 'draft' }, { handle: 'x_y_z' }, venue),
    ).toThrow();
  });

  test('an online event has a virtual location and no venue fields', () => {
    const online: Event = {
      ...base,
      place: { mode: 'online', venueId: null, onlineUrl: 'https://example.com/live' as never },
    };
    expect(toActivityPubEvent(ctx, online, { handle: 'x_y_z' }, null).location).toEqual({
      type: 'VirtualLocation',
      name: 'Online',
      url: 'https://example.com/live',
    });
  });

  test('optional fields are absent, not null', () => {
    const bare = toActivityPubEvent(
      ctx,
      { ...base, summary: null, description: null, endsAt: null },
      { handle: 'x_y_z' },
      null,
    );
    expect('summary' in bare).toBe(false);
    expect('content' in bare).toBe(false);
    expect('endTime' in bare).toBe(false);
  });

  test('Mastodon-family servers get a Note that links to the event page', () => {
    const note = toEventAnnouncementNote(ctx, base, { handle: 'fado_club' }, venue);
    expect(note.type).toBe('Note');
    expect(note.content).toContain(base.url);
    expect(note.to).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
  });
});
