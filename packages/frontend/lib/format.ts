import type { EventCard, PaymentMode } from '@vibbr.co/contracts';

const EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  HUF: 2,
  KWD: 3,
  BHD: 3,
};

/** Minor units of a currency as a string, e.g. ("2500","EUR") -> "25.00". No float is involved. */
export function minorToDecimal(amount: string, currency: string): string {
  const exponent = EXPONENTS[currency] ?? 2;
  const digits = amount.padStart(exponent + 1, '0');
  if (exponent === 0) return digits;
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export function formatMoney(amount: string, currency: string, locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const exponent = EXPONENTS[currency] ?? 2;
  // Intl needs a number; amounts of this size are exact in a double after scaling.
  return formatter.format(Number(amount) / 10 ** exponent);
}

/** A decimal typed by a person ("25", "25,5", "25.50") as minor units, or null when it is not an amount. */
export function decimalToMinor(text: string, currency: string): string | null {
  const exponent = EXPONENTS[currency] ?? 2;
  const normalized = text.trim().replace(',', '.');
  const match = /^(\d{1,12})(?:\.(\d*))?$/.exec(normalized);
  if (!match) return null;
  const whole = match[1] as string;
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) return null;
  return `${whole}${fraction.padEnd(exponent, '0')}`.replace(/^0+(?=\d)/, '');
}

export function formatEventWhen(startsAt: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(startsAt));
}

export function priceLabel(
  card: Pick<EventCard, 'free' | 'priceFrom'>,
  locale?: string,
): string | null {
  if (card.priceFrom) return formatMoney(card.priceFrom.amount, card.priceFrom.currency, locale);
  return null;
}

/** How a ticket is paid for, as the key of its label. */
export function paymentModeKey(mode: PaymentMode): `payment.${PaymentMode}` {
  return `payment.${mode}`;
}

/** A new random key for one purchase attempt. The same key is reused when the attempt is retried. */
export function newIdempotencyKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
