import { describe, expect, test } from '@jest/globals';
import { errorCode, errorStatus } from './errors';

describe('error reading', () => {
  test('reads the API code from an axios-shaped error', () => {
    const error = {
      response: { status: 409, data: { error: { code: 'sold_out', message: 'x' } } },
    };
    expect(errorCode(error)).toBe('sold_out');
    expect(errorStatus(error)).toBe(409);
  });
  test('reads a flat error', () => {
    expect(errorCode({ code: 'forbidden', status: 403 })).toBe('forbidden');
  });
  test('tolerates nothing', () => {
    expect(errorCode(null)).toBeUndefined();
    expect(errorStatus('x')).toBeUndefined();
  });
});
