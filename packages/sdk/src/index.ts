import type { ApiError, EventCard } from '@vibbr.co/contracts';
import { isEventCard } from './guards';
import { getEventUrl, isEventId } from './links';

export { isEventCard } from './guards';
export { getEventUrl, isEventId, parseEventUrl } from './links';

export type { EventCard } from '@vibbr.co/contracts';

export const DEFAULT_BASE_URL = 'https://api.vibbr.co';

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
    const id = requireEventId(eventId);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/events/${id}/card`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw await toError(response);
    const body: unknown = await response.json();
    if (!isEventCard(body))
      throw new VibbrError(502, 'invalid_response', 'Vibbr sent an event card in an unknown shape');
    return body;
  }

  /**
   * Cards for several events in one request. Unknown or unpublished ids are
   * absent from the result; the order of `eventIds` is kept.
   */
  async getEventCards(eventIds: readonly string[]): Promise<EventCard[]> {
    const ids = [...new Set(eventIds.map(requireEventId))];
    if (ids.length === 0) return [];
    if (ids.length > 50) throw new RangeError('at most 50 events per request');
    const response = await this.fetchImpl(`${this.baseUrl}/v1/events/cards?ids=${ids.join(',')}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw await toError(response);
    const body = (await response.json()) as { items?: unknown };
    const items = Array.isArray(body.items) ? body.items.filter(isEventCard) : [];
    const byId = new Map(items.map((card) => [card.id, card]));
    return ids.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    });
  }
}

/** The public page of an event. Kept for callers of 0.1.0; prefer `getEventUrl`. */
export function eventUrl(eventId: string): string {
  return getEventUrl(eventId);
}

function requireEventId(value: string): string {
  if (!isEventId(value)) throw new RangeError('not a Vibbr event id');
  return value;
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
