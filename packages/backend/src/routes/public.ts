import { EventId, EventListQuery, OrganizerId, VenueId } from '@vibbr.co/contracts';
import { Router } from 'express';
import {
  getEvent,
  getEventCard,
  getEventCards,
  getOrganizer,
  getVenue,
  isPublic,
  listEvents,
} from '../services/catalog';
import { listListingsForEvent } from '../services/resale';
import { listTicketTypes } from '../services/ticketTypes';
import { ApiException, notFound } from '../utils/errors';
import { parse, route } from '../utils/http';

/** Routes anyone may read. A draft is not public: its owner reads it through `/v1/manage`. */
export function publicRoutes(clock: () => Date): Router {
  const router = Router();

  router.get(
    '/events',
    route(async (req, res) => {
      res.json(await listEvents(parse(EventListQuery, req.query), clock()));
    }),
  );

  router.get(
    '/events/cards',
    route(async (req, res) => {
      const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
      const ids = raw.split(',').filter(Boolean);
      if (ids.length > 50)
        throw new ApiException('validation_failed', 'At most 50 events per request');
      res.json({ items: await getEventCards(ids.map((id) => parse(EventId, id))) });
    }),
  );

  router.get(
    '/events/:id',
    route(async (req, res) => {
      const event = await getEvent(parse(EventId, req.params.id));
      if (!isPublic(event.status)) throw notFound('Event');
      res.json(event);
    }),
  );

  router.get(
    '/events/:id/card',
    route(async (req, res) => {
      res.json(await getEventCard(parse(EventId, req.params.id)));
    }),
  );

  router.get(
    '/events/:id/ticket-types',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      const event = await getEvent(id);
      if (!isPublic(event.status)) throw notFound('Event');
      res.json({ items: await listTicketTypes(id, false) });
    }),
  );

  router.get(
    '/events/:id/resale',
    route(async (req, res) => {
      const id = parse(EventId, req.params.id);
      const event = await getEvent(id);
      if (!isPublic(event.status)) throw notFound('Event');
      res.json({ items: await listListingsForEvent(id) });
    }),
  );

  router.get(
    '/organizers/:id',
    route(async (req, res) => {
      res.json(await getOrganizer(parse(OrganizerId, req.params.id)));
    }),
  );

  router.get(
    '/venues/:id',
    route(async (req, res) => {
      res.json(await getVenue(parse(VenueId, req.params.id)));
    }),
  );

  return router;
}
