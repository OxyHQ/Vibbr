import { describe, expect, test } from 'bun:test';
import { EventCard } from '@vibbr.co/contracts';
import { isEventCard } from './guards';

const ID = `evt_${'a'.repeat(24)}`;
const good = {
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
  priceFrom: { amount: '1000', currency: 'EUR' },
  free: false,
  soldOut: false,
  url: `https://vibbr.co/e/${ID}`,
};

const variants: Array<[string, unknown]> = [
  ['valid', good],
  ['no price', { ...good, priceFrom: null }],
  ['missing title', { ...good, title: undefined }],
  ['numeric title', { ...good, title: 3 }],
  ['unknown status', { ...good, status: 'weird' }],
  ['price without currency', { ...good, priceFrom: { amount: '1' } }],
  ['free as string', { ...good, free: 'yes' }],
  ['null', null],
  ['array', []],
];

describe('isEventCard agrees with the contracts schema', () => {
  for (const [name, value] of variants) {
    test(name, () => {
      // The schema also checks formats (ids, urls, money digits) the guard leaves to
      // the server, so only "the guard accepts => the shape is right" is asserted, plus
      // the converse on every fixture that is structurally valid.
      const structural = isEventCard(value);
      const schema = EventCard.safeParse(value).success;
      expect(structural).toBe(schema);
    });
  }
});

describe('the client does not load the schema runtime', () => {
  test('contracts is a type-only import in every runtime module', async () => {
    for (const file of ['index.ts', 'guards.ts', 'links.ts']) {
      const source = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      expect(source).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]@vibbr\.co\/contracts/m);
      expect(source).not.toMatch(/from\s+['"]zod['"]/);
    }
  });
});
