import { z } from 'zod';

/**
 * Public ids. Every row has an internal key that never reaches the wire and a
 * `public_id` of `<prefix>_<24 hex>`. A prefix is a closed set: an id of the
 * wrong kind is rejected where it is parsed, not discovered later as a miss.
 */
export const ID_PREFIXES = {
  organizer: 'org',
  venue: 'ven',
  event: 'evt',
  ticketType: 'tkt',
  order: 'ord',
  ticket: 'tix',
  resaleListing: 'rsl',
  waitlistEntry: 'wle',
  payment: 'pay',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const HEX24 = '[0-9a-f]{24}';

export function idSchema<K extends IdKind>(kind: K) {
  const prefix = ID_PREFIXES[kind];
  return z.string().regex(new RegExp(`^${prefix}_${HEX24}$`), `expected a ${prefix}_ id`);
}

export const OrganizerId = idSchema('organizer');
export const VenueId = idSchema('venue');
export const EventId = idSchema('event');
export const TicketTypeId = idSchema('ticketType');
export const OrderId = idSchema('order');
export const TicketId = idSchema('ticket');
export const ResaleListingId = idSchema('resaleListing');
export const WaitlistEntryId = idSchema('waitlistEntry');

/** Oxy account or organization id, as Oxy issues it. Opaque to Vibbr. */
export const OxyAccountId = z.string().min(1).max(200);

export function newPublicId(kind: IdKind): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${ID_PREFIXES[kind]}_${hex}`;
}
