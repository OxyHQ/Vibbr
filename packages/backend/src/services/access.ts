import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import type { Authority } from '../authority';
import { type DatabaseOrTransaction, getDb } from '../db';
import { eventStaff } from '../db/schema';
import { ApiException, forbidden } from '../utils/errors';
import { findEventRow, findOrganizerRow } from './catalog';

type Db = DatabaseOrTransaction;

/** Who may edit an event and sell its tickets: the organizer's account or organization. */
export async function assertCanManageEvent(
  authority: Authority,
  req: Request,
  eventPublicId: string,
  db: Db = getDb(),
): Promise<void> {
  const { organizer } = await findEventRow(eventPublicId, db);
  await authority.assertActsFor(req, organizer.oxyAccountId);
}

/** The door: managers, and people the organizer added as scanners for this event. */
export async function assertCanScan(
  authority: Authority,
  req: Request,
  eventPublicId: string,
  db: Db = getDb(),
): Promise<void> {
  const caller = authority.callerId(req);
  const { event, organizer } = await findEventRow(eventPublicId, db);
  if (organizer.oxyAccountId === caller) return;
  const [staff] = await db
    .select({ role: eventStaff.role })
    .from(eventStaff)
    .where(and(eq(eventStaff.eventId, event.id), eq(eventStaff.oxyAccountId, caller)));
  if (staff) return;
  try {
    await authority.assertActsFor(req, organizer.oxyAccountId);
  } catch (error) {
    if (error instanceof ApiException) throw forbidden('You cannot scan tickets for this event');
    throw error;
  }
}

export async function assertCanActForOrganizer(
  authority: Authority,
  req: Request,
  organizerPublicId: string,
  db: Db = getDb(),
): Promise<void> {
  const organizer = await findOrganizerRow(organizerPublicId, db);
  await authority.assertActsFor(req, organizer.oxyAccountId);
}

export async function addStaff(
  eventPublicId: string,
  oxyAccountId: string,
  role: 'scanner' | 'manager',
  db: Db = getDb(),
): Promise<void> {
  const { event } = await findEventRow(eventPublicId, db);
  await db
    .insert(eventStaff)
    .values({ eventId: event.id, oxyAccountId, role })
    .onConflictDoUpdate({ target: [eventStaff.eventId, eventStaff.oxyAccountId], set: { role } });
}

export async function removeStaff(
  eventPublicId: string,
  oxyAccountId: string,
  db: Db = getDb(),
): Promise<void> {
  const { event } = await findEventRow(eventPublicId, db);
  await db
    .delete(eventStaff)
    .where(and(eq(eventStaff.eventId, event.id), eq(eventStaff.oxyAccountId, oxyAccountId)));
}
