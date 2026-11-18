import type { EventListQuery, OrderInput } from '@vibbr.co/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Filters = Partial<Omit<EventListQuery, 'cursor' | 'limit' | 'radiusKm'>> & {
  radiusKm?: number;
};

export const keys = {
  events: (filters: Filters) => ['events', filters] as const,
  event: (id: string) => ['event', id] as const,
  card: (id: string) => ['event-card', id] as const,
  ticketTypes: (id: string) => ['ticket-types', id] as const,
  resale: (id: string) => ['resale', id] as const,
  tickets: ['my-tickets'] as const,
  orders: ['my-orders'] as const,
  waitlist: ['my-waitlist'] as const,
  organizers: ['my-organizers'] as const,
  managed: (organizerId: string) => ['managed-events', organizerId] as const,
  managedEvent: (id: string) => ['managed-event', id] as const,
  managedTypes: (id: string) => ['managed-types', id] as const,
  attendance: (id: string) => ['attendance', id] as const,
};

export function useEvents(filters: Filters, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.events(filters),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.events.list({ ...filters, limit: 20, ...(pageParam && { cursor: pageParam }) }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useEvent = (id: string) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api.events.get(id) });
export const useEventTicketTypes = (id: string) =>
  useQuery({
    queryKey: keys.ticketTypes(id),
    queryFn: () => api.events.ticketTypes(id).then((r) => r.items),
  });
export const useEventResale = (id: string) =>
  useQuery({
    queryKey: keys.resale(id),
    queryFn: () => api.events.resale(id).then((r) => r.items),
  });
export const useMyTickets = (enabled: boolean) =>
  useQuery({
    queryKey: keys.tickets,
    enabled,
    queryFn: () => api.tickets.mine().then((r) => r.items),
  });
export const useMyWaitlist = (enabled: boolean) =>
  useQuery({
    queryKey: keys.waitlist,
    enabled,
    queryFn: () => api.waitlist.mine().then((r) => r.items),
  });
export const useMyOrganizers = (enabled: boolean) =>
  useQuery({
    queryKey: keys.organizers,
    enabled,
    queryFn: () => api.organizers.mine().then((r) => r.items),
  });
export const useManagedEvents = (organizerId: string | undefined) =>
  useQuery({
    queryKey: keys.managed(organizerId ?? ''),
    enabled: !!organizerId,
    queryFn: () => api.manage.events(organizerId as string).then((r) => r.items),
  });
export const useManagedEvent = (id: string) =>
  useQuery({ queryKey: keys.managedEvent(id), queryFn: () => api.manage.event(id) });
export const useManagedTicketTypes = (id: string) =>
  useQuery({
    queryKey: keys.managedTypes(id),
    queryFn: () => api.manage.ticketTypes(id).then((r) => r.items),
  });
export const useAttendance = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.attendance(id),
    enabled,
    queryFn: () => api.events.attendance(id).then((r) => r.state),
  });

export function useSetAttendance(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (state: 'going' | 'interested' | null) => api.events.setAttendance(id, state),
    onSuccess: ({ state }) => client.setQueryData(keys.attendance(id), state),
  });
}

/** One purchase attempt. The caller owns the idempotency key so a retry reuses it. */
export function usePlaceOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: OrderInput; key: string }) =>
      api.orders.create(input, key),
    onSettled: (_order, _error, { input }) => {
      void client.invalidateQueries({ queryKey: keys.tickets });
      void client.invalidateQueries({ queryKey: keys.ticketTypes(input.eventId) });
      void client.invalidateQueries({ queryKey: keys.orders });
    },
  });
}

export function useTransferTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { ticketId: string; to: string; holderName?: string }) =>
      api.tickets.transfer(v.ticketId, v.to, v.holderName),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tickets }),
  });
}

export function useResaleActions(eventId: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.tickets });
    void client.invalidateQueries({ queryKey: keys.resale(eventId) });
  };
  return {
    list: useMutation({
      mutationFn: (v: { ticketId: string; price: string }) => api.resale.list(v.ticketId, v.price),
      onSuccess: refresh,
    }),
    withdraw: useMutation({
      mutationFn: (listingId: string) => api.resale.withdraw(listingId),
      onSuccess: refresh,
    }),
    buy: useMutation({
      mutationFn: (v: { listingId: string; holderName?: string }) =>
        api.resale.buy(v.listingId, v.holderName),
      onSuccess: refresh,
    }),
  };
}

export function useWaitlistActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.waitlist });
  return {
    join: useMutation({
      mutationFn: (v: { ticketTypeId: string; quantity: number }) =>
        api.waitlist.join(v.ticketTypeId, v.quantity),
      onSuccess: refresh,
    }),
    leave: useMutation({ mutationFn: (id: string) => api.waitlist.leave(id), onSuccess: refresh }),
  };
}
