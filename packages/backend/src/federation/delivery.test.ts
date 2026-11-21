import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';

process.env.FEDERATION_ENABLED = 'true';

const ACTOR = 'https://social.example/users/ana';
const posted: { inbox: string; type: unknown }[] = [];
let failWith: number | null = null;

mock.module('./remote', () => ({
  isRemoteHttpsUrl: (value: unknown) =>
    typeof value === 'string' && value.startsWith('https://') && !value.includes('vibbr.co'),
  fetchRemoteDocument: async (url: string) =>
    url === ACTOR
      ? {
          id: ACTOR,
          inbox: `${ACTOR}/inbox`,
          endpoints: { sharedInbox: 'https://social.example/inbox' },
        }
      : null,
}));
mock.module('./deliver', () => ({
  DeliveryError: class DeliveryError extends Error {
    constructor(
      message: string,
      readonly permanent: boolean,
    ) {
      super(message);
    }
  },
  postActivity: async (_handle: string, inbox: string, activity: Record<string, unknown>) => {
    if (failWith !== null) {
      const { DeliveryError } = await import('./deliver.js');
      throw new DeliveryError(
        `inbox answered ${failWith}`,
        failWith >= 400 && failWith < 500 && failWith !== 429,
      );
    }
    posted.push({ inbox, type: activity.type });
  },
}));

import { federationFollowers, federationOutbox, organizers } from '../db/schema';
import { createTestDatabase, TEST_DATABASE_URL } from '../testing/database';

describe.skipIf(!TEST_DATABASE_URL)('federation inbox and delivery (real Postgres)', () => {
  let drop: () => Promise<void>;
  let organizerId: number;
  let handle: string;
  let eventId: string;

  beforeAll(async () => {
    const { getDb } = await import('../db/index.js');
    const { makeOrganizer, makePublishedEvent, makeVenue } = await import('../testing/fixtures.js');
    ({ drop } = await createTestDatabase());
    const organizer = await makeOrganizer();
    handle = organizer.handle;
    await getDb().update(organizers).set({ federated: true }).where(eq(organizers.handle, handle));
    const [row] = await getDb().select().from(organizers).where(eq(organizers.handle, handle));
    organizerId = row?.id as number;
    eventId = (await makePublishedEvent(organizer.id, (await makeVenue()).id)).id;
  });
  afterAll(async () => {
    await drop?.();
  });

  test('a Follow is stored and answered with an Accept; an event reaches followers with retries; an Undo removes them', async () => {
    const { getDb } = await import('../db/index.js');
    const { processInboxActivity } = await import('./inbox.js');
    const { runOutbox } = await import('./outbox.js');
    const { federateEvent } = await import('./publish.js');
    const db = getDb();
    const self = `https://vibbr.co/ap/users/${handle}`;
    const follow = { id: `${ACTOR}/follows/1`, type: 'Follow', actor: ACTOR, object: self };

    // A forged actor (the signature verified a different one) and an unknown organizer change nothing.
    await processInboxActivity({ ...follow, actor: 'https://evil.example/users/x' }, ACTOR);
    await processInboxActivity({ ...follow, object: 'https://vibbr.co/ap/users/nobody' }, ACTOR);
    expect(await db.select().from(federationFollowers)).toHaveLength(0);

    await processInboxActivity(follow, ACTOR);
    const followers = await db.select().from(federationFollowers);
    expect(followers).toHaveLength(1);
    expect(followers[0]?.sharedInboxUrl).toBe('https://social.example/inbox');
    expect(followers[0]?.organizerId).toBe(organizerId);

    // The Accept goes out to the follower's own inbox.
    const now = new Date('2026-11-21T10:00:00.000Z');
    expect(await runOutbox(now)).toBe(1);
    expect(posted).toEqual([{ inbox: `${ACTOR}/inbox`, type: 'Accept' }]);

    // Publishing reaches the follower once, through the shared inbox, as a Create of the event.
    await federateEvent(eventId, 'Create');
    await runOutbox(new Date(now.getTime() + 60_000));
    expect(posted.at(-1)).toEqual({ inbox: 'https://social.example/inbox', type: 'Create' });

    // A server that answers 500 is retried later; one that answers 410 is given up on.
    failWith = 500;
    await federateEvent(eventId, 'Update');
    const t2 = new Date(now.getTime() + 120_000);
    await runOutbox(t2);
    const [retry] = await db
      .select()
      .from(federationOutbox)
      .where(eq(federationOutbox.attempts, 1));
    expect(retry?.failedAt).toBeNull();
    expect(retry?.nextAttemptAt.getTime()).toBeGreaterThan(t2.getTime());
    failWith = 410;
    await runOutbox(new Date(t2.getTime() + 24 * 3600_000));
    const [gone] = await db.select().from(federationOutbox).where(eq(federationOutbox.attempts, 2));
    expect(gone?.failedAt).not.toBeNull();
    failWith = null;

    await processInboxActivity({ type: 'Undo', actor: ACTOR, object: follow }, ACTOR);
    expect(await db.select().from(federationFollowers)).toHaveLength(0);
  });
});
