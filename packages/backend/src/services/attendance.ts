import { and, eq } from 'drizzle-orm';
import { type DatabaseOrTransaction, getDb } from '../db';
import { attendance } from '../db/schema';
import { findEventRow } from './catalog';

type Db = DatabaseOrTransaction;

/** `going` or `interested`; null removes the mark. Idempotent. */
export async function setAttendance(
  oxyAccountId: string,
  eventPublicId: string,
  state: 'going' | 'interested' | null,
  db: Db = getDb(),
): Promise<'going' | 'interested' | null> {
  const { event } = await findEventRow(eventPublicId, db);
  if (state === null) {
    await db
      .delete(attendance)
      .where(and(eq(attendance.eventId, event.id), eq(attendance.oxyAccountId, oxyAccountId)));
    return null;
  }
  await db
    .insert(attendance)
    .values({ eventId: event.id, oxyAccountId, state })
    .onConflictDoUpdate({
      target: [attendance.eventId, attendance.oxyAccountId],
      set: { state, updatedAt: new Date() },
    });
  return state;
}

export async function getAttendance(
  oxyAccountId: string,
  eventPublicId: string,
  db: Db = getDb(),
): Promise<'going' | 'interested' | null> {
  const { event } = await findEventRow(eventPublicId, db);
  const [row] = await db
    .select({ state: attendance.state })
    .from(attendance)
    .where(and(eq(attendance.eventId, event.id), eq(attendance.oxyAccountId, oxyAccountId)));
  return row?.state ?? null;
}
