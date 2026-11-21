import type { Event, Organizer, Venue } from '@vibbr.co/contracts';

/**
 * The ActivityPub shape of a Vibbr event (ADR 0002). This is a PROJECTION of the
 * event row: the row stays the source of truth, and nothing here is stored.
 *
 * The vocabulary follows what Mobilizon and Gancio read and write: an `Event`
 * with `startTime`/`endTime`, a `Place` location and Mobilizon's `status`
 * (`CONFIRMED`/`CANCELLED`) and `joinMode`. Mastodon ignores `Event` objects it
 * does not understand, so federation to it is a `Note` linking to the event page
 * (`toEventAnnouncementNote`), never the Event itself.
 */
export const AP_CONTEXT = [
  'https://www.w3.org/ns/activitystreams',
  {
    mz: 'https://joinmobilizon.org/ns#',
    status: 'mz:status',
    joinMode: 'mz:joinMode',
    timezone: 'mz:timezone',
  },
] as const;

export interface FederationOrigin {
  /** The origin the actors and objects are served from, without a trailing slash. */
  readonly origin: string;
}

export function eventObjectId({ origin }: FederationOrigin, eventId: string): string {
  return `${origin}/ap/events/${eventId}`;
}

export function organizerActorId({ origin }: FederationOrigin, handle: string): string {
  return `${origin}/ap/users/${handle}`;
}

export interface ApEvent {
  '@context': typeof AP_CONTEXT;
  id: string;
  type: 'Event';
  name: string;
  summary?: string;
  content?: string;
  startTime: string;
  endTime?: string;
  timezone: string;
  status: 'CONFIRMED' | 'CANCELLED';
  joinMode: 'external';
  url: string;
  attributedTo: string;
  published?: string;
  updated?: string;
  attachment?: Array<{ type: 'Link'; href: string; name: string }>;
  location?: ApPlace | ApVirtualLocation;
}

interface ApPlace {
  type: 'Place';
  name: string;
  address?: {
    type: 'PostalAddress';
    streetAddress?: string;
    addressLocality: string;
    addressRegion?: string;
    addressCountry: string;
  };
  latitude?: number;
  longitude?: number;
}

interface ApVirtualLocation {
  type: 'VirtualLocation';
  name: string;
  url: string;
}

/**
 * Only a published, cancelled or ended event is public. A draft has no
 * projection: asking for one is a programming error, not a missing page.
 */
export function toActivityPubEvent(
  ctx: FederationOrigin,
  event: Event,
  organizer: Pick<Organizer, 'handle'>,
  venue: Venue | null,
): ApEvent {
  if (event.status === 'draft') throw new Error('a draft event has no ActivityPub form');

  const location =
    event.place.venueId && venue
      ? placeOf(venue)
      : event.place.onlineUrl
        ? virtualOf(event.place.onlineUrl)
        : undefined;
  return {
    '@context': AP_CONTEXT,
    id: eventObjectId(ctx, event.id),
    type: 'Event',
    name: event.title,
    ...(event.summary && { summary: event.summary }),
    ...(event.description && { content: event.description }),
    startTime: event.startsAt,
    ...(event.endsAt && { endTime: event.endsAt }),
    timezone: event.timeZone,
    status: event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    // Tickets are bought on Vibbr: remote servers send people to the page, they do not RSVP in-band.
    joinMode: 'external',
    url: event.url,
    attributedTo: organizerActorId(ctx, organizer.handle),
    ...(event.publishedAt && { published: event.publishedAt }),
    ...(location && { location }),
  };
}

function placeOf(venue: Venue): ApPlace {
  return {
    type: 'Place',
    name: venue.name,
    address: {
      type: 'PostalAddress',
      ...(venue.addressLine && { streetAddress: venue.addressLine }),
      addressLocality: venue.city,
      ...(venue.region && { addressRegion: venue.region }),
      addressCountry: venue.countryCode,
    },
    ...(venue.location && {
      latitude: venue.location.latitude,
      longitude: venue.location.longitude,
    }),
  };
}

function virtualOf(url: string): ApVirtualLocation {
  return { type: 'VirtualLocation', name: 'Online', url };
}

/**
 * What Mastodon-family servers get instead of an Event: a Note that links to the
 * event page. They render it as a post, and the link is how people reach tickets.
 */
export function toEventAnnouncementNote(
  ctx: FederationOrigin,
  event: Event,
  organizer: Pick<Organizer, 'handle'>,
  venue: Venue | null,
) {
  const when = new Date(event.startsAt).toISOString().slice(0, 16).replace('T', ' ');
  const where = venue ? ` · ${venue.name}, ${venue.city}` : '';
  return {
    '@context': 'https://www.w3.org/ns/activitystreams' as const,
    id: `${eventObjectId(ctx, event.id)}#announcement`,
    type: 'Note' as const,
    attributedTo: organizerActorId(ctx, organizer.handle),
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    content: `${event.title} — ${when} UTC${where}\n${event.url}`,
    url: event.url,
    ...(event.publishedAt && { published: event.publishedAt }),
  };
}
