import type { EventCard } from '@vibbr.co/contracts';

const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const STATUSES = new Set(['draft', 'published', 'cancelled', 'ended']);

/**
 * Checks an API answer against the shape of `EventCard` without the schema
 * runtime: an app that only renders cards must not load zod for it. The schema in
 * `@vibbr.co/contracts` stays the source of truth; `guards.test.ts` fails if this
 * guard and that schema ever disagree on a fixture.
 */
export function isEventCard(value: unknown): value is EventCard {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const price = v.priceFrom;
  return (
    isString(v.id) &&
    isString(v.title) &&
    isString(v.startsAt) &&
    isNullableString(v.endsAt) &&
    isString(v.timeZone) &&
    isString(v.status) &&
    STATUSES.has(v.status) &&
    isNullableString(v.coverUrl) &&
    isNullableString(v.venueName) &&
    isNullableString(v.city) &&
    isString(v.organizerName) &&
    (price === null ||
      (typeof price === 'object' &&
        price !== null &&
        isString((price as Record<string, unknown>).amount) &&
        isString((price as Record<string, unknown>).currency))) &&
    typeof v.free === 'boolean' &&
    typeof v.soldOut === 'boolean' &&
    isString(v.url)
  );
}
