import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { organizers } from '../db/schema';

/** An organizer that opted in to federation, by handle (case-insensitive, as handles are). */
export async function findFederatedOrganizer(handle: string) {
  const rows = await getDb()
    .select()
    .from(organizers)
    .where(sql`lower(${organizers.handle}) = lower(${handle}) and ${organizers.federated} = true`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findOrganizerByPublicId(publicId: string) {
  const rows = await getDb()
    .select()
    .from(organizers)
    .where(eq(organizers.publicId, publicId))
    .limit(1);
  return rows[0] ?? null;
}
