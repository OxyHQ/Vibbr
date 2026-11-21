import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { federationFollowers, federationOutbox, organizers } from '../db/schema';
import { logger } from '../utils/logger';
import { DeliveryError, postActivity } from './deliver';

const BATCH = 20;
const MAX_ATTEMPTS = 8;
/** A claimed row is not offered to another worker for this long, so a crash retries it. */
const LEASE_MINUTES = 5;

export const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export async function enqueueTo(
  organizerId: number,
  inboxUrl: string,
  activity: Record<string, unknown>,
): Promise<void> {
  await getDb().insert(federationOutbox).values({ organizerId, inboxUrl, activity });
}

/** One delivery per distinct inbox: followers on the same server share one when it has a shared inbox. */
export async function enqueueToFollowers(
  organizerId: number,
  activity: Record<string, unknown>,
): Promise<number> {
  const followers = await getDb()
    .select({ inbox: federationFollowers.inboxUrl, shared: federationFollowers.sharedInboxUrl })
    .from(federationFollowers)
    .where(eq(federationFollowers.organizerId, organizerId));
  const inboxes = [...new Set(followers.map((f) => f.shared ?? f.inbox))];
  if (inboxes.length === 0) return 0;
  await getDb()
    .insert(federationOutbox)
    .values(inboxes.map((inboxUrl) => ({ organizerId, inboxUrl, activity })));
  return inboxes.length;
}

interface Claimed {
  id: number;
  organizer_id: number;
  inbox_url: string;
  activity: Record<string, unknown>;
  attempts: number;
}

const backoffMinutes = (attempts: number) => Math.min(2 ** attempts, 12 * 60);

/** Claims due rows (`SKIP LOCKED`, so several tasks never take the same one) and delivers them. */
export async function runOutbox(now: Date): Promise<number> {
  const db = getDb();
  const claimed = (await db.execute(sql`
    update federation_outbox set next_attempt_at = ${new Date(now.getTime() + LEASE_MINUTES * 60_000)}
    where id in (
      select id from federation_outbox
      where delivered_at is null and failed_at is null and next_attempt_at <= ${now}
      order by next_attempt_at limit ${BATCH} for update skip locked
    )
    returning id, organizer_id, inbox_url, activity, attempts
  `)) as unknown as Claimed[];

  for (const row of claimed) {
    const [organizer] = await db
      .select({ handle: organizers.handle })
      .from(organizers)
      .where(eq(organizers.id, row.organizer_id));
    try {
      if (!organizer) throw new DeliveryError('organizer is gone', true);
      await postActivity(organizer.handle, row.inbox_url, row.activity);
      await db
        .update(federationOutbox)
        .set({ deliveredAt: now, lastError: null })
        .where(eq(federationOutbox.id, row.id));
    } catch (error) {
      const permanent = error instanceof DeliveryError && error.permanent;
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = permanent || attempts >= MAX_ATTEMPTS;
      await db
        .update(federationOutbox)
        .set({
          attempts,
          lastError: message.slice(0, 500),
          ...(giveUp
            ? { failedAt: now }
            : { nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000) }),
        })
        .where(and(eq(federationOutbox.id, row.id), isNull(federationOutbox.deliveredAt)));
      logger.warn('Federation delivery failed', { id: row.id, attempts, giveUp, message });
    }
  }
  return claimed.length;
}
