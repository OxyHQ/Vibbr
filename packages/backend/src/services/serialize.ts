import type {
  Event,
  EventCard,
  Order,
  Organizer,
  ResaleListing,
  Ticket,
  TicketType,
  Venue,
} from '@vibbr.co/contracts';
import { eventUrl } from '../config';
import type {
  events,
  orders,
  organizers,
  resaleListings,
  ticketTypes,
  tickets,
  venues,
} from '../db/schema';

type OrganizerRow = typeof organizers.$inferSelect;
type VenueRow = typeof venues.$inferSelect;
type EventRow = typeof events.$inferSelect;
type TicketTypeRow = typeof ticketTypes.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;
type ListingRow = typeof resaleListings.$inferSelect;

export function organizerDto(row: OrganizerRow): Organizer {
  return {
    id: row.publicId as Organizer['id'],
    kind: row.kind,
    oxyAccountId: row.oxyAccountId,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    avatarUrl: row.avatarUrl as Organizer['avatarUrl'],
  };
}

export function venueDto(row: VenueRow): Venue {
  return {
    id: row.publicId as Venue['id'],
    name: row.name,
    addressLine: row.addressLine,
    city: row.city,
    region: row.region,
    countryCode: row.countryCode,
    timeZone: row.timeZone,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    capacity: row.capacity,
  };
}

export function eventDto(
  row: EventRow,
  refs: { organizerPublicId: string; venuePublicId: string | null },
): Event {
  return {
    id: row.publicId as Event['id'],
    organizerId: refs.organizerPublicId as Event['organizerId'],
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category as Event['category'],
    tags: row.tags,
    status: row.status,
    timeZone: row.timeZone,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    place: {
      mode: row.mode,
      venueId: refs.venuePublicId as Event['place']['venueId'],
      onlineUrl: row.onlineUrl as Event['place']['onlineUrl'],
    },
    capacity: row.capacity,
    coverUrl: row.coverUrl as Event['coverUrl'],
    ageMinimum: row.ageMinimum,
    lineup: row.lineup as Event['lineup'],
    revision: row.revision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    url: eventUrl(row.publicId) as Event['url'],
  };
}

export function ticketTypeDto(row: TicketTypeRow, eventPublicId: string): TicketType {
  return {
    id: row.publicId as TicketType['id'],
    eventId: eventPublicId as TicketType['eventId'],
    name: row.name,
    description: row.description,
    priceAmount: row.priceAmount.toString(),
    currency: row.currency,
    paymentMode: row.paymentMode,
    quota: row.quota,
    remaining: row.quota - row.sold,
    perPersonLimit: row.perPersonLimit,
    salesStartAt: row.salesStartAt?.toISOString() ?? null,
    salesEndAt: row.salesEndAt?.toISOString() ?? null,
    named: row.named,
    transferable: row.transferable,
    resellable: row.resellable,
    resaleCapPercent: row.resaleCapPercent,
    hidden: row.hidden,
  };
}

export function ticketDto(
  row: TicketRow,
  refs: { orderPublicId: string; eventPublicId: string; ticketTypePublicId: string },
): Ticket {
  return {
    id: row.publicId as Ticket['id'],
    orderId: refs.orderPublicId as Ticket['orderId'],
    eventId: refs.eventPublicId as Ticket['eventId'],
    ticketTypeId: refs.ticketTypePublicId as Ticket['ticketTypeId'],
    holderOxyAccountId: row.holderOxyAccountId,
    holderName: row.holderName,
    status: row.status,
    paymentChoice: row.paymentChoice,
    paymentStatus: row.paymentStatus,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
  };
}

export function orderDto(row: OrderRow, eventPublicId: string, ticketList: Ticket[]): Order {
  return {
    id: row.publicId as Order['id'],
    eventId: eventPublicId as Order['eventId'],
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    totalAmount: row.totalAmount.toString(),
    currency: row.currency,
    paymentStatus: row.paymentStatus,
    tickets: ticketList,
    createdAt: row.createdAt.toISOString(),
  };
}

export function listingDto(
  row: ListingRow,
  refs: { ticketPublicId: string; eventPublicId: string },
): ResaleListing {
  return {
    id: row.publicId as ResaleListing['id'],
    ticketId: refs.ticketPublicId as ResaleListing['ticketId'],
    eventId: refs.eventPublicId as ResaleListing['eventId'],
    sellerOxyAccountId: row.sellerOxyAccountId,
    priceAmount: row.priceAmount.toString(),
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export type { EventCard };
