import { describe, expect, test } from '@jest/globals';
import { parseTime, wallTimeToUtc } from './zonedTime';

describe('wallTimeToUtc', () => {
  test('winter and summer offsets in Madrid', () => {
    expect(wallTimeToUtc(2026, 12, 20, 20, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-12-20T19:00:00.000Z',
    );
    expect(wallTimeToUtc(2026, 7, 20, 20, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-07-20T18:00:00.000Z',
    );
  });
  test('west of UTC and UTC itself', () => {
    expect(wallTimeToUtc(2026, 12, 20, 20, 0, 'America/New_York').toISOString()).toBe(
      '2026-12-21T01:00:00.000Z',
    );
    expect(wallTimeToUtc(2026, 12, 20, 20, 0, 'UTC').toISOString()).toBe(
      '2026-12-20T20:00:00.000Z',
    );
  });
  test('the day of a DST change keeps the local clock', () => {
    // Madrid springs forward on 2026-03-29: 03:00 local is 01:00 UTC.
    expect(wallTimeToUtc(2026, 3, 29, 3, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    expect(wallTimeToUtc(2026, 3, 29, 1, 30, 'Europe/Madrid').toISOString()).toBe(
      '2026-03-29T00:30:00.000Z',
    );
  });
});

describe('parseTime', () => {
  test('strict 24h HH:mm', () => {
    expect(parseTime('20:05')).toEqual({ hour: 20, minute: 5 });
    expect(parseTime('9:30')).toEqual({ hour: 9, minute: 30 });
    for (const bad of ['', '24:00', '12:60', '1230', 'ab:cd']) expect(parseTime(bad)).toBeNull();
  });
});
