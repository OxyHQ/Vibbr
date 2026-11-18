import { describe, expect, test } from '@jest/globals';
import { decimalToMinor, formatMoney, minorToDecimal, newIdempotencyKey } from './format';

describe('money formatting', () => {
  test('minor units to decimal without floats', () => {
    expect(minorToDecimal('2500', 'EUR')).toBe('25.00');
    expect(minorToDecimal('5', 'EUR')).toBe('0.05');
    expect(minorToDecimal('0', 'EUR')).toBe('0.00');
    expect(minorToDecimal('500', 'JPY')).toBe('500');
    expect(minorToDecimal('1234', 'KWD')).toBe('1.234');
  });

  test('typed decimals to minor units', () => {
    expect(decimalToMinor('25', 'EUR')).toBe('2500');
    expect(decimalToMinor('25,5', 'EUR')).toBe('2550');
    expect(decimalToMinor('0.05', 'EUR')).toBe('5');
    expect(decimalToMinor('0', 'EUR')).toBe('0');
    expect(decimalToMinor('500', 'JPY')).toBe('500');
  });

  test('rejects what is not an amount', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1e3', '1..2']) {
      expect(decimalToMinor(bad, 'EUR')).toBeNull();
    }
    expect(decimalToMinor('1.5', 'JPY')).toBeNull();
  });

  test('formats a currency', () => {
    expect(formatMoney('2500', 'EUR', 'en-US')).toBe('€25.00');
  });
});

test('idempotency keys are distinct and long enough for the API', () => {
  const a = newIdempotencyKey();
  expect(a).toHaveLength(32);
  expect(newIdempotencyKey()).not.toBe(a);
});
