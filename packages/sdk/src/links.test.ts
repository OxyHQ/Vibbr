import { describe, expect, test } from 'bun:test';
import { getEventUrl, isEventId, parseEventUrl } from './links';

const ID = `evt_${'a'.repeat(24)}`;

describe('links (no schema runtime)', () => {
  test('recognises ids and round-trips a URL', () => {
    expect(isEventId(ID)).toBe(true);
    expect(isEventId('evt_XYZ')).toBe(false);
    expect(parseEventUrl(getEventUrl(ID))).toBe(ID);
    expect(parseEventUrl(`${getEventUrl(ID)}/`)).toBe(ID);
  });
  test('ignores foreign hosts, other paths and non-URLs', () => {
    expect(parseEventUrl(`https://example.com/e/${ID}`)).toBeNull();
    expect(parseEventUrl(`https://vibbr.co/o/${ID}`)).toBeNull();
    expect(parseEventUrl('nope')).toBeNull();
  });
  test('this module imports nothing at runtime', async () => {
    const source = await Bun.file(new URL('./links.ts', import.meta.url)).text();
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
