import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { federationFollowers } from '../db/schema';
import { logger } from '../utils/logger';
import { enqueueTo } from './outbox';
import { findFederatedOrganizer } from './organizerActor';
import { fetchRemoteDocument, isRemoteHttpsUrl } from './remote';
import { federationUrls } from './urls';

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;

/**
 * The key behind a signature's `keyId`, read from the remote actor itself. The key's owner must be
 * on the same host as the key id: a server cannot vouch for an actor on another one.
 */
export async function fetchPublicKey(keyId: string) {
  const doc = await fetchRemoteDocument(keyId.split('#')[0] ?? keyId);
  if (!doc) return null;
  const key = asRecord(doc.publicKey) ?? doc;
  const pem = key.publicKeyPem;
  const owner = typeof key.owner === 'string' ? key.owner : doc.id;
  if (typeof pem !== 'string' || (key.id ?? doc.id) !== keyId || !isRemoteHttpsUrl(owner)) {
    return null;
  }
  if (new URL(owner).host !== new URL(keyId).host) return null;
  return { publicKeyPem: pem, actorUri: owner };
}

/** `https://vibbr.co/ap/users/<handle>` -> the handle, for our own actors only. */
function localHandle(uri: unknown): string | null {
  if (typeof uri !== 'string') return null;
  const match = /^([^/]+\/\/[^/]+)\/ap\/users\/([^/?#]+)$/.exec(uri);
  if (!match) return null;
  const expected = federationUrls.actor(match[2] ?? '');
  return expected === uri ? (match[2] ?? null) : null;
}

/**
 * What the inbox does with an activity whose signature already verified (the router checks it).
 * Only three things matter to an events app: a Follow (answered with Accept), its Undo, and the
 * remote actor deleting itself. Everything else is acknowledged and ignored: a Join is not taken
 * in-band (`joinMode: external`, tickets are bought on Vibbr).
 */
export async function processInboxActivity(
  activity: Json,
  verifiedActorUri: string,
): Promise<void> {
  // The signed actor must be the one the activity claims to come from.
  if (activity.actor !== verifiedActorUri || !isRemoteHttpsUrl(verifiedActorUri)) return;
  const db = getDb();

  if (activity.type === 'Follow') {
    const handle = localHandle(activity.object);
    const organizer = handle ? await findFederatedOrganizer(handle) : null;
    if (!organizer || typeof activity.id !== 'string') return;

    const actor = await fetchRemoteDocument(verifiedActorUri);
    const endpoints = asRecord(actor?.endpoints);
    const inboxUrl = actor?.inbox;
    if (!actor || actor.id !== verifiedActorUri || !isRemoteHttpsUrl(inboxUrl)) return;
    const sharedInboxUrl = isRemoteHttpsUrl(endpoints?.sharedInbox) ? endpoints.sharedInbox : null;

    await db
      .insert(federationFollowers)
      .values({
        organizerId: organizer.id,
        actorUri: verifiedActorUri,
        inboxUrl,
        sharedInboxUrl,
        followActivityId: activity.id,
      })
      .onConflictDoUpdate({
        target: [federationFollowers.organizerId, federationFollowers.actorUri],
        set: { inboxUrl, sharedInboxUrl, followActivityId: activity.id },
      });

    const self = federationUrls.actor(organizer.handle);
    await enqueueTo(organizer.id, inboxUrl, {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${self}#accepts/${randomUUID()}`,
      type: 'Accept',
      actor: self,
      object: activity,
    });
    return;
  }

  if (activity.type === 'Undo') {
    const inner = asRecord(activity.object);
    if (inner?.type !== 'Follow' || inner.actor !== verifiedActorUri) return;
    const handle = localHandle(inner.object);
    const organizer = handle ? await findFederatedOrganizer(handle) : null;
    if (!organizer) return;
    await db
      .delete(federationFollowers)
      .where(
        and(
          eq(federationFollowers.organizerId, organizer.id),
          eq(federationFollowers.actorUri, verifiedActorUri),
        ),
      );
    return;
  }

  if (activity.type === 'Delete' && activity.object === verifiedActorUri) {
    await db.delete(federationFollowers).where(eq(federationFollowers.actorUri, verifiedActorUri));
    return;
  }

  logger.debug('Federation inbox ignored an activity', { type: String(activity.type) });
}
