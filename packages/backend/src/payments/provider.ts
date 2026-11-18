import type { PaymentChoice } from '@vibbr.co/contracts';
import { ApiException } from '../utils/errors';

/**
 * What the orders service needs from a payment rail. v1 ships one rail that
 * collects nothing (ADR 0001 §3): free tickets and tickets paid at the door.
 * Online payment is Peable's: it is a second implementation of this interface,
 * switched on by `VIBBR_ONLINE_PAYMENTS=peable`, and Vibbr never holds a
 * provider credential or object.
 */
export interface PaymentProvider {
  /** Whether this rail can take `choice` right now. */
  supports(choice: PaymentChoice): boolean;
}

export const noCollectionProvider: PaymentProvider = {
  supports: (choice) => choice === 'free' || choice === 'door',
};

export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const mode = env.VIBBR_ONLINE_PAYMENTS;
  if (mode === undefined || mode === '' || mode === 'off') return noCollectionProvider;
  // The Peable rail is a separate change; until it exists, asking for it is a
  // configuration error, never a silent fallback to "free".
  throw new Error(`VIBBR_ONLINE_PAYMENTS=${mode} is not available in this build`);
}

export function assertSupported(provider: PaymentProvider, choice: PaymentChoice): void {
  if (!provider.supports(choice)) {
    throw new ApiException('payment_unavailable', 'Online payment is not available yet');
  }
}
