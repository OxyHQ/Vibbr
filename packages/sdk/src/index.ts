import { type ApiError, EventCard, EventId } from '@vibbr.co/contracts';

export type { EventCard } from '@vibbr.co/contracts';

export const DEFAULT_BASE_URL = 'https://api.vibbr.co';
const WEB_ORIGIN = 'https://vibbr.co';

export class VibbrError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VibbrError';
  }
}

export interface VibbrClientOptions {
  /** API origin. Defaults to `https://api.vibbr.co`. */
  readonly baseUrl?: string;
  /** Injected for tests and non-global runtimes. */
  readonly fetch?: typeof fetch;
}

/**
 * Read-only access to Vibbr events. A post, a message or any other embed stores
 * only the event id and asks this client for the card to render it.
 */
export class VibbrClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VibbrClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** The card for one public event. Throws `VibbrError` with code `not_found` for an unknown or unpublished id. */
  async getEventCard(eventId: string): Promise<EventCard> {
    const id = EventId.parse(eventId);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/events/${id}/card`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw await toError(response);
    return EventCard.parse(await response.json());
  }

  /**
   * Cards for several events in one request. Unknown or unpublished ids are
   * absent from the result; the order of `eventIds` is kept.
   */
  async getEventCards(eventIds: readonly string[]): Promise<EventCard[]> {
    const ids = [...new Set(eventIds.map((id) => EventId.parse(id)))];
    if (ids.length === 0) return [];
    if (ids.length > 50) throw new RangeError('at most 50 events per request');
    const response = await this.fetchImpl(`${this.baseUrl}/v1/events/cards?ids=${ids.join(',')}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw await toError(response);
    const body = (await response.json()) as { items?: unknown };
    const items = Array.isArray(body.items) ? body.items.map((item) => EventCard.parse(item)) : [];
    const byId = new Map(items.map((card) => [card.id, card]));
    return ids.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    });
  }
}

/** The public page of an event. */
export function eventUrl(eventId: string): string {
  return `${WEB_ORIGIN}/e/${EventId.parse(eventId)}`;
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
  return id && EventId.safeParse(id).success ? id : null;
}

async function toError(response: Response): Promise<VibbrError> {
  let code = 'internal_error';
  let message = `Vibbr answered ${response.status}`;
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (body.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    // Not JSON; keep the status-based message.
  }
  return new VibbrError(response.status, code, message);
}
