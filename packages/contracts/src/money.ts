import { z } from 'zod';

/**
 * Money is an integer count of the currency's minor units, carried as a decimal
 * string on the wire so no float and no 2^53 limit can touch it. A float amount
 * is a bug.
 */
export const MinorUnits = z.string().regex(/^\d{1,15}$/, 'amount is a non-negative integer string');
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code');

export const Money = z.object({ amount: MinorUnits, currency: CurrencyCode }).strict();
export type Money = z.infer<typeof Money>;

export function toMinorUnits(value: bigint): string {
  if (value < 0n) throw new RangeError('amount cannot be negative');
  return value.toString();
}

export function fromMinorUnits(value: string): bigint {
  return BigInt(MinorUnits.parse(value));
}
