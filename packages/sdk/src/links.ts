/**
 * Vibbr event links, with no runtime dependency. This module sits on the
 * startup path of apps that only need to recognise a link (a feed, a composer),
 * so it must not pull the schema runtime in: `@vibbr.co/sdk/links`.
 */
export const WEB_ORIGIN = 'https://vibbr.co';

/** `evt_` and 24 lowercase hex characters: the same shape `@vibbr.co/contracts` validates. */
export const EVENT_ID_PATTERN = /^evt_[0-9a-f]{24}$/;

export function isEventId(value: string): boolean {
  return EVENT_ID_PATTERN.test(value);
}

/** The public page of an event. */
export function getEventUrl(eventId: string): string {
  if (!isEventId(eventId)) throw new RangeError('not a Vibbr event id');
  return `${WEB_ORIGIN}/e/${eventId}`;
}

/** The event id inside a Vibbr event URL, or null when the text is not one. */
export function parseEventUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== WEB_ORIGIN) return null;
  const match = /^\/e\/([^/]+)\/?$/.exec(url.pathname);
  const id = match?.[1];
  return id && isEventId(id) ? id : null;
}
