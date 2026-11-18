import type {
  Event,
  EventCard,
  EventInput,
  EventListQuery,
  EventPatch,
  Order,
  OrderInput,
  Organizer,
  OrganizerInput,
  ResaleListing,
  ScanResult,
  Ticket,
  TicketCode,
  TicketType,
  TicketTypeInput,
  Venue,
  VenueInput,
  WaitlistEntry,
} from '@vibbr.co/contracts';
import { API_URL } from './config';
import { oxyServices } from './oxyServices';

/**
 * The Vibbr API client. Retry belongs to React Query for reads and to the
 * screen for writes: an order is never replayed here without its idempotency
 * key, because the key is what makes a replay safe.
 */
const linked = oxyServices.createLinkedClient({
  baseURL: API_URL,
  enableRetry: false,
  requestTimeout: 15_000,
}).client;

type Page<T> = { items: T[]; nextCursor: string | null };
type Items<T> = { items: T[] };

function toQuery(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const api = {
  events: {
    list: (
      query: Partial<Omit<EventListQuery, 'radiusKm' | 'limit'>> & {
        radiusKm?: number;
        limit?: number;
      },
    ) => linked.get<Page<EventCard>>(`/v1/events${toQuery(query)}`),
    get: (id: string) => linked.get<Event>(`/v1/events/${id}`),
    card: (id: string) => linked.get<EventCard>(`/v1/events/${id}/card`),
    ticketTypes: (id: string) => linked.get<Items<TicketType>>(`/v1/events/${id}/ticket-types`),
    resale: (id: string) => linked.get<Items<ResaleListing>>(`/v1/events/${id}/resale`),
    attendance: (id: string) =>
      linked.get<{ state: 'going' | 'interested' | null }>(`/v1/events/${id}/attendance`),
    setAttendance: (id: string, state: 'going' | 'interested' | null) =>
      linked.put<{ state: 'going' | 'interested' | null }>(`/v1/events/${id}/attendance`, {
        state,
      }),
  },
  organizers: {
    get: (id: string) => linked.get<Organizer>(`/v1/organizers/${id}`),
    mine: () => linked.get<Items<Organizer>>('/v1/me/organizers'),
    create: (input: OrganizerInput) => linked.post<Organizer>('/v1/organizers', input),
  },
  venues: {
    get: (id: string) => linked.get<Venue>(`/v1/venues/${id}`),
    create: (input: VenueInput) => linked.post<Venue>('/v1/venues', input),
  },
  manage: {
    events: (organizerId: string) =>
      linked.get<Items<Event>>(`/v1/manage/organizers/${organizerId}/events`),
    event: (id: string) => linked.get<Event>(`/v1/manage/events/${id}`),
    ticketTypes: (id: string) =>
      linked.get<Items<TicketType>>(`/v1/manage/events/${id}/ticket-types`),
    createEvent: (input: EventInput) => linked.post<Event>('/v1/events', input),
    patchEvent: (id: string, patch: EventPatch) => linked.patch<Event>(`/v1/events/${id}`, patch),
    publish: (id: string, revision: number) =>
      linked.post<Event>(`/v1/events/${id}/publish`, { revision }),
    cancel: (id: string) => linked.post<Event>(`/v1/events/${id}/cancel`, {}),
    createTicketType: (eventId: string, input: TicketTypeInput) =>
      linked.post<TicketType>(`/v1/events/${eventId}/ticket-types`, input),
  },
  orders: {
    create: (input: OrderInput, idempotencyKey: string) =>
      linked.post<Order>('/v1/orders', input, { headers: { 'Idempotency-Key': idempotencyKey } }),
    mine: () => linked.get<Items<Order>>('/v1/me/orders'),
    cancel: (id: string) => linked.post<void>(`/v1/orders/${id}/cancel`, {}),
  },
  tickets: {
    mine: () => linked.get<Items<Ticket>>('/v1/me/tickets'),
    get: (id: string) => linked.get<Ticket>(`/v1/tickets/${id}`),
    code: (id: string) => linked.get<TicketCode>(`/v1/tickets/${id}/code`),
    transfer: (id: string, toOxyAccountId: string, holderName?: string) =>
      linked.post<Ticket>(`/v1/tickets/${id}/transfer`, {
        toOxyAccountId,
        ...(holderName && { holderName }),
      }),
  },
  resale: {
    list: (ticketId: string, priceAmount: string) =>
      linked.post<ResaleListing>('/v1/resale', { ticketId, priceAmount }),
    withdraw: (id: string) => linked.delete<void>(`/v1/resale/${id}`),
    buy: (id: string, holderName?: string) =>
      linked.post<Ticket>(`/v1/resale/${id}/buy`, holderName ? { holderName } : {}),
  },
  waitlist: {
    mine: () => linked.get<Items<WaitlistEntry>>('/v1/me/waitlist'),
    join: (ticketTypeId: string, quantity: number) =>
      linked.post<WaitlistEntry>('/v1/waitlist', { ticketTypeId, quantity }),
    leave: (id: string) => linked.delete<void>(`/v1/waitlist/${id}`),
    claim: (id: string, idempotencyKey: string) =>
      linked.post<Order>(`/v1/waitlist/${id}/claim`, { idempotencyKey }),
  },
  door: {
    scan: (eventId: string, code: string, scannedAt?: string) =>
      linked.post<ScanResult>('/v1/scan', { eventId, code, ...(scannedAt && { scannedAt }) }),
    scanBatch: (eventId: string, scans: { code: string; scannedAt: string }[]) =>
      linked.post<{ results: ScanResult[] }>('/v1/scan/batch', { eventId, scans }),
  },
};
