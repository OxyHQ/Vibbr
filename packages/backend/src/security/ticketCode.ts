import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A ticket's admission code is `v1.<ticketId>.<codeVersion>.<window>.<mac>`.
 * The MAC covers the ticket, its code version and a 30 second window, so:
 *   - a screenshot stops working within a minute (rotation);
 *   - a transfer or resale bumps `codeVersion`, which kills every code minted
 *     for the previous holder at once;
 *   - nothing about a ticket is stored for the code: the scanner recomputes it.
 */
export const CODE_WINDOW_SECONDS = 30;
/** Clock skew and the walk to the door: the previous and the next window verify too. */
const WINDOW_TOLERANCE = 1;
const MAC_BYTES = 16;

export type CodeCheck =
  | { readonly ok: true; readonly ticketId: string; readonly codeVersion: number }
  | { readonly ok: false; readonly reason: 'malformed' | 'bad_signature' | 'expired' };

export function windowOf(instant: Date): number {
  return Math.floor(instant.getTime() / 1000 / CODE_WINDOW_SECONDS);
}

function mac(secret: string, ticketId: string, codeVersion: number, window: number): string {
  return createHmac('sha256', secret)
    .update(`${ticketId}.${codeVersion}.${window}`)
    .digest()
    .subarray(0, MAC_BYTES)
    .toString('base64url');
}

export function mintTicketCode(
  secret: string,
  ticketId: string,
  codeVersion: number,
  at: Date,
): { code: string; expiresAt: Date } {
  const window = windowOf(at);
  return {
    code: `v1.${ticketId}.${codeVersion}.${window}.${mac(secret, ticketId, codeVersion, window)}`,
    expiresAt: new Date((window + 1 + WINDOW_TOLERANCE) * CODE_WINDOW_SECONDS * 1000),
  };
}

/** Verifies a code as of `at` (the scan instant, which an offline scanner supplies). */
export function verifyTicketCode(secret: string, code: string, at: Date): CodeCheck {
  const parts = code.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return { ok: false, reason: 'malformed' };
  const [, ticketId, versionText, windowText, given] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const codeVersion = Number(versionText);
  const window = Number(windowText);
  if (
    !/^tix_[0-9a-f]{24}$/.test(ticketId) ||
    !Number.isSafeInteger(codeVersion) ||
    codeVersion < 1
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (!Number.isSafeInteger(window) || window < 0) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(mac(secret, ticketId, codeVersion, window));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (Math.abs(windowOf(at) - window) > WINDOW_TOLERANCE) return { ok: false, reason: 'expired' };
  return { ok: true, ticketId, codeVersion };
}
