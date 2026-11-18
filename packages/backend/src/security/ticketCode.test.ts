import { describe, expect, test } from 'bun:test';
import { CODE_WINDOW_SECONDS, mintTicketCode, verifyTicketCode } from './ticketCode';

const SECRET = 'test-secret-test-secret-test-secret';
const TICKET = `tix_${'a'.repeat(24)}`;
const T0 = new Date('2026-12-01T20:00:00Z');
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('ticket code', () => {
  test('verifies in its own window and the neighbours', () => {
    const { code } = mintTicketCode(SECRET, TICKET, 1, T0);
    expect(verifyTicketCode(SECRET, code, T0)).toEqual({
      ok: true,
      ticketId: TICKET,
      codeVersion: 1,
    });
    expect(verifyTicketCode(SECRET, code, later(CODE_WINDOW_SECONDS)).ok).toBe(true);
  });

  test('a screenshot expires', () => {
    const { code } = mintTicketCode(SECRET, TICKET, 1, T0);
    expect(verifyTicketCode(SECRET, code, later(CODE_WINDOW_SECONDS * 3))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  test('a different secret, version or ticket fails', () => {
    const { code } = mintTicketCode(SECRET, TICKET, 1, T0);
    expect(verifyTicketCode('another-secret-another-secret-xx', code, T0)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const forged = code.replace('.1.', '.2.');
    expect(verifyTicketCode(SECRET, forged, T0)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('rejects malformed input', () => {
    for (const bad of ['', 'v1', 'v2.a.b.c.d', `v1.nope.1.1.x`, `v1.${TICKET}.0.1.x`]) {
      expect(verifyTicketCode(SECRET, bad, T0)).toEqual({ ok: false, reason: 'malformed' });
    }
  });
});
