import { config } from '../config';
import { getEvent, getOrganizer, getVenue, isPublic } from '../services/catalog';
import { logger } from '../utils/logger';
import { toActivityPubEvent } from './event';
import { findFederatedOrganizer } from './organizerActor';
import { enqueueToFollowers, PUBLIC } from './outbox';
import { federationUrls } from './urls';

/**
 * Tells followers about an event: `Create` when it is published, `Update` when it changes or is
 * cancelled (never `Delete`: tickets and history stay, ADR 0002). One place, called after the row
 * is saved. It never fails the request: a federation problem must not undo a published event.
 */
export async function federateEvent(eventId: string, kind: 'Create' | 'Update'): Promise<void> {
  if (!config.federation.enabled) return;
  try {
    const event = await getEvent(eventId);
    if (!isPublic(event.status)) return;
    const organizerDto = await getOrganizer(event.organizerId);
    const organizer = await findFederatedOrganizer(organizerDto.handle);
    if (!organizer) return;
    const venue = event.place.venueId ? await getVenue(event.place.venueId) : null;
    const object = toActivityPubEvent(
      { origin: `https://${config.federation.domain}` },
      event,
      organizerDto,
      venue,
    );
    const actor = federationUrls.actor(organizer.handle);
    await enqueueToFollowers(organizer.id, {
      '@context': 'https://www.w3.org/ns/activitystreams',
      // The revision is in the id: an edit is a new activity, a retry of the same one is not.
      id: `${object.id}#${kind.toLowerCase()}-${event.revision}`,
      type: kind,
      actor,
      to: [PUBLIC],
      cc: [federationUrls.followers(organizer.handle)],
      object,
    });
  } catch (error) {
    logger.error('Federating an event failed', error);
  }
}
