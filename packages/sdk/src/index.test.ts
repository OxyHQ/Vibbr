import { describe, expect, test } from 'bun:test';
import { eventUrl, getEventUrl, parseEventUrl, VibbrClient, VibbrError } from './index';

const ID = `evt_${'a'.repeat(24)}`;
const card = {
  id: ID,
  title: 'Night',
  startsAt: '2026-12-01T20:00:00.000Z',
  endsAt: null,
  timeZone: 'Europe/Madrid',
  status: 'published',
  coverUrl: null,
  venueName: 'Sala',
  city: 'Madrid',
  organizerName: 'Org',
  priceFrom: null,
  free: true,
  soldOut: false,
  url: `https://vibbr.co/e/${ID}`,
};

describe('VibbrClient', () => {
  test('parses a card', async () => {
    const client = new VibbrClient({
      fetch: (async () => Response.json(card)) as unknown as typeof fetch,
    });
    expect((await client.getEventCard(ID)).title).toBe('Night');
  });

  test('maps an API error', async () => {
    const client = new VibbrClient({
      fetch: (async () =>
        Response.json(
          { error: { code: 'not_found', message: 'nope' } },
          { status: 404 },
        )) as unknown as typeof fetch,
    });
    await expect(client.getEventCard(ID)).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(client.getEventCard(ID)).rejects.toBeInstanceOf(VibbrError);
  });

  test('passes the abort signal to the request', async () => {
    let seen: AbortSignal | null | undefined;
    const client = new VibbrClient({
      fetch: (async (_url: unknown, init?: RequestInit) => {
        seen = init?.signal;
        return Response.json(card);
      }) as unknown as typeof fetch,
    });
    const controller = new AbortController();
    await client.getEventCard(ID, { signal: controller.signal });
    expect(seen).toBe(controller.signal);
  });

  test('rejects a malformed id before any request', async () => {
    const client = new VibbrClient({
      fetch: (async () => {
        throw new Error('must not be called');
      }) as unknown as typeof fetch,
    });
    await expect(client.getEventCard('evt_1')).rejects.toThrow();
  });

  test('keeps the requested order and drops unknown ids', async () => {
    const other = `evt_${'b'.repeat(24)}`;
    const client = new VibbrClient({
      fetch: (async () =>
        Response.json({ items: [{ ...card, id: other }, card] })) as unknown as typeof fetch,
    });
    const cards = await client.getEventCards([ID, `evt_${'c'.repeat(24)}`, other]);
    expect(cards.map((c) => c.id)).toEqual([ID, other]);
  });
});

describe('event urls', () => {
  test('getEventUrl matches eventUrl and refuses a bad id', () => {
    expect(getEventUrl(ID)).toBe(eventUrl(ID));
    expect(() => getEventUrl('evt_1')).toThrow();
  });
  test('round trips', () => {
    expect(parseEventUrl(eventUrl(ID))).toBe(ID);
  });
  test('rejects foreign hosts and bad ids', () => {
    expect(parseEventUrl(`https://example.com/e/${ID}`)).toBeNull();
    expect(parseEventUrl('https://vibbr.co/e/nope')).toBeNull();
    expect(parseEventUrl('not a url')).toBeNull();
  });
});
