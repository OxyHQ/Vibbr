import { config } from './config';
import { runOutbox } from './federation/outbox';
import { endPastEvents } from './services/catalog';
import { expireReservations } from './services/orders';
import { expireOffers, promoteWaitlist } from './services/waitlist';
import { logger } from './utils/logger';

const INTERVAL_MS = 60_000;

/**
 * Housekeeping that time alone makes necessary: free the quota of unpaid
 * reservations, close unclaimed waitlist offers, and mark finished events.
 * Every step is safe to run from several tasks at once (`SKIP LOCKED` and
 * guarded UPDATEs), so no leader election is needed.
 */
export async function runHousekeeping(now: Date): Promise<void> {
  const released = await expireReservations(now);
  await promoteWaitlist(released, now);
  await expireOffers(now);
  await endPastEvents(now);
  if (config.federation.enabled) await runOutbox(now);
}

export function startHousekeeping(): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runHousekeeping(new Date())
      .catch((error: unknown) => logger.error('Housekeeping failed', error))
      .finally(() => {
        running = false;
      });
  }, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
