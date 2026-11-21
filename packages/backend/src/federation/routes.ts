import { Router } from 'express';
import { createActorRouter, createWebfingerRouter } from '@oxy.so/federation/node';
import { createLocalActorBuilder } from '@oxy.so/federation';
import { config } from '../config';
import {
  getEvent,
  getOrganizer,
  getVenue,
  isPublic,
  listOrganizerEvents,
} from '../services/catalog';
import { logger } from '../utils/logger';
import { getPublicKey } from './keys';
import { findFederatedOrganizer } from './organizerActor';
import { toActivityPubEvent } from './event';
import { fetchPublicKey, processInboxActivity } from './inbox';
import { federationUrls } from './urls';

const AP_CONTENT_TYPE = 'application/activity+json; charset=utf-8';
const ORIGIN = { origin: `https://${config.federation.domain}` };

const wantsActivityPub = (accept: string | string[] | undefined): boolean =>
  /application\/(activity\+json|ld\+json)/.test(
    Array.isArray(accept) ? accept.join(',') : (accept ?? ''),
  );

async function resolveUser(handle: string) {
  const organizer = await findFederatedOrganizer(handle);
  if (!organizer) return null;
  return {
    id: organizer.publicId,
    _id: organizer.publicId,
    name: { displayName: organizer.name },
    bio: organizer.bio,
    avatar: organizer.avatarUrl,
    createdAt: organizer.createdAt.toISOString(),
    kind: 'organization' as const,
  };
}

const consent = {
  isSharingEnabledFromUser: () => true,
  getSharingStateByUsername: async (handle: string) =>
    (await findFederatedOrganizer(handle)) ? ('enabled' as const) : ('unknown-user' as const),
};

const log = {
  debug: (message: string, detail?: unknown) => logger.debug(message, detail),
  warn: (message: string, detail?: unknown) => logger.warn(message, detail),
  error: (message: string, detail?: unknown) => logger.error(message, detail),
};

/** `/.well-known/webfinger` and host-meta: how a remote server finds `@handle@vibbr.co`. */
export function webfingerRouter(): Router {
  return createWebfingerRouter({
    domain: config.federation.domain,
    federationEnabled: config.federation.enabled,
    urls: federationUrls,
    resolveUser,
    consent,
    // A short, per-request answer: an organizer that stops federating must stop resolving at once.
    cache: { get: async () => null, set: () => undefined },
    httpCacheTtlSeconds: 0,
    logger: { error: (message, detail) => logger.error(message, detail) },
  });
}

/**
 * The actor document, its collections and the inbox (Follow, Undo, Delete: see `inbox.ts`).
 */
export function actorRouter(): Router {
  return createActorRouter({
    domain: config.federation.domain,
    federationEnabled: config.federation.enabled,
    apContentType: AP_CONTENT_TYPE,
    urls: federationUrls,
    wantsActivityPub,
    getPublicKey,
    resolveUser,
    consent,
    buildLocalActorObject: createLocalActorBuilder({
      domain: config.federation.domain,
      urls: federationUrls,
      media: { resolveAvatar: (ref) => ref, resolveBanner: (ref) => ref },
    }),
    getBanner: async () => null,
    inbound: {
      fetchPublicKey,
      trustForwardedHost: true,
      // No queue in front of the inbox: the activities handled here are small and the work
      // (one actor fetch, one insert) is bounded.
      enqueueInboxActivity: async () => false,
      processInboxActivity,
    },
    // The engine builds this collection from Oxy accounts; remote followers here are not accounts,
    // so the collection reports none rather than listing people who never agreed to be listed.
    fetchFollowPage: async () => ({ members: [], total: 0, hasMore: false }),
    httpCacheTtlSeconds: 0,
    logger: log,
  });
}

/** The organizer's outbox and the event objects it points to. Public events only. */
export function objectRouter(): Router {
  const router = Router();

  router.get('/ap/users/:handle/outbox', async (req, res, next) => {
    try {
      const organizer = await findFederatedOrganizer(req.params.handle);
      if (!organizer) return void res.status(404).end();
      const items = (await listOrganizerEvents(organizer.publicId)).filter((e) =>
        isPublic(e.status),
      );
      const actor = federationUrls.actor(organizer.handle);
      const activities = await Promise.all(
        items.map(async (event) => {
          const venue = event.place.venueId ? await getVenue(event.place.venueId) : null;
          const object = toActivityPubEvent(ORIGIN, event, organizer, venue);
          return {
            type: 'Create',
            id: `${object.id}#create`,
            actor,
            published: object.published,
            to: ['https://www.w3.org/ns/activitystreams#Public'],
            object,
          };
        }),
      );
      res.type(AP_CONTENT_TYPE).json({
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: federationUrls.outbox(organizer.handle),
        type: 'OrderedCollection',
        totalItems: activities.length,
        orderedItems: activities,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/ap/events/:id', async (req, res, next) => {
    try {
      const event = await getEvent(req.params.id).catch(() => null);
      if (!event || !isPublic(event.status)) return void res.status(404).end();
      const organizer = await getOrganizer(event.organizerId);
      if (!(await findFederatedOrganizer(organizer.handle))) return void res.status(404).end();
      const venue = event.place.venueId ? await getVenue(event.place.venueId) : null;
      res.type(AP_CONTENT_TYPE).json(toActivityPubEvent(ORIGIN, event, organizer, venue));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
