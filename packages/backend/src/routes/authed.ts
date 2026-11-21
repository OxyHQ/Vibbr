import {
  AttendanceInput,
  EventId,
  EventInput,
  EventPatch,
  EventRevision,
  OrderId,
  OrderInput,
  OrganizerId,
  OrganizerInput,
  ResaleBuyInput,
  ResaleListingId,
  ResaleListingInput,
  ScanBatchInput,
  ScanInput,
  TicketId,
  TicketTypeId,
  TicketTypeInput,
  TransferInput,
  VenueInput,
  WaitlistClaimInput,
  WaitlistEntryId,
  WaitlistInput,
  OxyAccountId,
} from '@vibbr.co/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Authority } from '../authority';
import { federateEvent } from '../federation/publish';
import type { PaymentProvider } from '../payments/provider';
import {
  assertCanActForOrganizer,
  assertCanManageEvent,
  assertCanScan,
  addStaff,
  removeStaff,
} from '../services/access';
import { getAttendance, setAttendance } from '../services/attendance';
import {
  cancelEvent,
  createEvent,
  createOrganizer,
  createVenue,
  getEvent,
  listOrganizerEvents,
  listOrganizersFor,
  patchEvent,
  publishEvent,
} from '../services/catalog';
import { cancelOrder, getOrderFor, listOrdersFor, reserveOrder } from '../services/orders';
import { buyListing, createListing, withdrawListing } from '../services/resale';
import { scanBatch, scanTicket } from '../services/scanning';
import { getTicketFor, listTicketsFor, mintCodeFor, transferTicket } from '../services/tickets';
import {
  createTicketType,
  deleteTicketType,
  findTicketTypeRow,
  listTicketTypes,
  updateTicketType,
} from '../services/ticketTypes';
import {
  claimOffer,
  joinWaitlist,
  leaveWaitlist,
  listWaitlistFor,
  promoteWaitlist,
} from '../services/waitlist';
import { ApiException } from '../utils/errors';
import { parse, route } from '../utils/http';
import { getDb } from '../db';
import { events } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface AuthedDeps {
  readonly authority: Authority;
  readonly provider: PaymentProvider;
  readonly clock: () => Date;
}

const idempotencyKey = (header: unknown): string => {
  if (typeof header !== 'string' || header.length < 8 || header.length > 80) {
    throw new ApiException(
      'bad_request',
      'An Idempotency-Key header of 8 to 80 characters is required',
    );
  }
  return header;
};

const TicketTypeChanges = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).nullable(),
    quota: z.number().int().positive(),
    salesStartAt: z.iso.datetime().nullable(),
    salesEndAt: z.iso.datetime().nullable(),
    hidden: z.boolean(),
  })
  .partial()
  .strict();

const StaffInput = z
  .object({ oxyAccountId: OxyAccountId, role: z.enum(['scanner', 'manager']) })
  .strict();

async function eventIdOfType(ticketTypePublicId: string): Promise<string> {
  const type = await findTicketTypeRow(ticketTypePublicId);
  const [event] = await getDb()
    .select({ publicId: events.publicId })
    .from(events)
    .where(eq(events.id, type.eventId));
  return (event as NonNullable<typeof event>).publicId;
}

/** Routes that need a signed-in Oxy account. Authority over an organizer is checked per request. */
export function authedRoutes({ authority, provider, clock }: AuthedDeps): Router {
  const router = Router();
  const caller = authority.callerId.bind(authority);

  // ------------------------------------------------------------ organizers
  router.post(
    '/organizers',
    route(async (req, res) => {
      res.status(201).json(await createOrganizer(caller(req), parse(OrganizerInput, req.body)));
    }),
  );
  router.get(
    '/me/organizers',
    route(async (req, res) => {
      res.json({ items: await listOrganizersFor(caller(req)) });
    }),
  );
  router.post(
    '/venues',
    route(async (req, res) => {
      res.status(201).json(await createVenue(caller(req), parse(VenueInput, req.body)));
    }),
  );

  // ---------------------------------------------------------------- manage
  router.get(
    '/manage/organizers/:id/events',
    route(async (req, res) => {
      const id = parse(OrganizerId, req.params.id);
      await assertCanActForOrganizer(authority, req, id);
      res.json({ items: await listOrganizerEvents(id) });
    }),
  );
  router.get(
    '/manage/events/:id',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      res.json(await getEvent(id));
    }),
  );
  router.get(
    '/manage/events/:id/ticket-types',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      res.json({ items: await listTicketTypes(id, true) });
    }),
  );

  router.post(
    '/events',
    route(async (req, res) => {
      const input = parse(EventInput, req.body);
      await assertCanActForOrganizer(authority, req, input.organizerId);
      res.status(201).json(await createEvent(input));
    }),
  );
  router.patch(
    '/events/:id',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      const patched = await patchEvent(id, parse(EventPatch, req.body));
      await federateEvent(id, 'Update');
      res.json(patched);
    }),
  );
  router.post(
    '/events/:id/publish',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      const published = await publishEvent(id, parse(EventRevision, req.body).revision);
      await federateEvent(id, 'Create');
      res.json(published);
    }),
  );
  router.post(
    '/events/:id/cancel',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      const cancelled = await cancelEvent(id, clock());
      await federateEvent(id, 'Update');
      res.json(cancelled);
    }),
  );

  router.post(
    '/events/:id/ticket-types',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      res.status(201).json(await createTicketType(id, parse(TicketTypeInput, req.body)));
    }),
  );
  router.patch(
    '/ticket-types/:id',
    route(async (req, res) => {
      const id = parse(TicketTypeId, req.params.id);
      await assertCanManageEvent(authority, req, await eventIdOfType(id));
      res.json(await updateTicketType(id, parse(TicketTypeChanges, req.body)));
    }),
  );
  router.delete(
    '/ticket-types/:id',
    route(async (req, res) => {
      const id = parse(TicketTypeId, req.params.id);
      await assertCanManageEvent(authority, req, await eventIdOfType(id));
      await deleteTicketType(id);
      res.status(204).end();
    }),
  );

  router.put(
    '/events/:id/staff',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      const input = parse(StaffInput, req.body);
      await addStaff(id, input.oxyAccountId, input.role);
      res.status(204).end();
    }),
  );
  router.delete(
    '/events/:id/staff/:account',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      await assertCanManageEvent(authority, req, id);
      await removeStaff(id, parse(OxyAccountId, req.params.account));
      res.status(204).end();
    }),
  );

  // ---------------------------------------------------------------- orders
  router.post(
    '/orders',
    route(async (req, res) => {
      const order = await reserveOrder(
        caller(req),
        parse(OrderInput, req.body),
        idempotencyKey(req.get('idempotency-key')),
        {
          now: clock(),
          provider,
        },
      );
      res.status(201).json(order);
    }),
  );
  router.get(
    '/me/orders',
    route(async (req, res) => {
      res.json({ items: await listOrdersFor(caller(req)) });
    }),
  );
  router.get(
    '/orders/:id',
    route(async (req, res) => {
      res.json(await getOrderFor(caller(req), parse(OrderId, req.params.id)));
    }),
  );
  router.post(
    '/orders/:id/cancel',
    route(async (req, res) => {
      const released = await cancelOrder(caller(req), parse(OrderId, req.params.id), clock());
      await promoteWaitlist(released, clock());
      res.status(204).end();
    }),
  );

  // --------------------------------------------------------------- tickets
  router.get(
    '/me/tickets',
    route(async (req, res) => {
      res.json({ items: await listTicketsFor(caller(req)) });
    }),
  );
  router.get(
    '/tickets/:id',
    route(async (req, res) => {
      res.json(await getTicketFor(caller(req), parse(TicketId, req.params.id)));
    }),
  );
  router.get(
    '/tickets/:id/code',
    route(async (req, res) => {
      res.set('cache-control', 'no-store');
      res.json(await mintCodeFor(caller(req), parse(TicketId, req.params.id), clock()));
    }),
  );
  router.post(
    '/tickets/:id/transfer',
    route(async (req, res) => {
      const input = parse(TransferInput, req.body);
      res.json(
        await transferTicket(
          caller(req),
          parse(TicketId, req.params.id),
          input.toOxyAccountId,
          input.holderName,
          clock(),
        ),
      );
    }),
  );

  // ---------------------------------------------------------------- resale
  router.post(
    '/resale',
    route(async (req, res) => {
      const input = parse(ResaleListingInput, req.body);
      res
        .status(201)
        .json(await createListing(caller(req), input.ticketId, input.priceAmount, clock()));
    }),
  );
  router.delete(
    '/resale/:id',
    route(async (req, res) => {
      await withdrawListing(caller(req), parse(ResaleListingId, req.params.id), clock());
      res.status(204).end();
    }),
  );
  router.post(
    '/resale/:id/buy',
    route(async (req, res) => {
      const input = parse(ResaleBuyInput, req.body ?? {});
      const ticketId = await buyListing(
        caller(req),
        parse(ResaleListingId, req.params.id),
        input.holderName,
        clock(),
      );
      res.json(await getTicketFor(caller(req), ticketId));
    }),
  );

  // -------------------------------------------------------------- waitlist
  router.post(
    '/waitlist',
    route(async (req, res) => {
      const input = parse(WaitlistInput, req.body);
      res.status(201).json(await joinWaitlist(caller(req), input.ticketTypeId, input.quantity));
    }),
  );
  router.get(
    '/me/waitlist',
    route(async (req, res) => {
      res.json({ items: await listWaitlistFor(caller(req)) });
    }),
  );
  router.delete(
    '/waitlist/:id',
    route(async (req, res) => {
      await leaveWaitlist(caller(req), parse(WaitlistEntryId, req.params.id));
      res.status(204).end();
    }),
  );
  router.post(
    '/waitlist/:id/claim',
    route(async (req, res) => {
      const input = parse(WaitlistClaimInput, req.body);
      res
        .status(201)
        .json(
          await claimOffer(
            caller(req),
            parse(WaitlistEntryId, req.params.id),
            input.idempotencyKey,
            { now: clock(), provider },
          ),
        );
    }),
  );

  // ------------------------------------------------------------------ door
  router.post(
    '/scan',
    route(async (req, res) => {
      const input = parse(ScanInput, req.body);
      await assertCanScan(authority, req, input.eventId);
      res.json(
        await scanTicket(
          caller(req),
          input.eventId,
          input.code,
          input.scannedAt ? new Date(input.scannedAt) : clock(),
        ),
      );
    }),
  );
  router.post(
    '/scan/batch',
    route(async (req, res) => {
      const input = parse(ScanBatchInput, req.body);
      await assertCanScan(authority, req, input.eventId);
      res.json({
        results: await scanBatch(
          caller(req),
          input.eventId,
          input.scans as { code: string; scannedAt: string }[],
        ),
      });
    }),
  );

  // ------------------------------------------------------------ attendance
  router.put(
    '/events/:id/attendance',
    route(async (req, res) => {
      const state = parse(AttendanceInput, req.body).state;
      res.json({ state: await setAttendance(caller(req), parse(EventId, req.params.id), state) });
    }),
  );
  router.get(
    '/events/:id/attendance',
    route(async (req, res) => {
      res.json({ state: await getAttendance(caller(req), parse(EventId, req.params.id)) });
    }),
  );

  return router;
}
