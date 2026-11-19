import { describe, expect, test } from 'bun:test';
import type { Request, Response } from 'express';
import { embedCors } from './embedCors';

function run(method: string, origin?: string) {
  const headers = new Map<string, string>();
  let status = 0;
  let nextCalled = false;
  const req = {
    method,
    get: (name: string) => (name === 'origin' ? origin : undefined),
  } as Request;
  const res = {
    vary: () => res,
    setHeader: (k: string, v: string) => headers.set(k.toLowerCase(), v),
    status: (s: number) => {
      status = s;
      return res;
    },
    end: () => res,
  } as unknown as Response;
  embedCors(['https://mention.earth'])(req, res, () => {
    nextCalled = true;
  });
  return { headers, status, nextCalled };
}

describe('embedCors', () => {
  test('allows a listed origin to read, without credentials', () => {
    const { headers, nextCalled } = run('GET', 'https://mention.earth');
    expect(headers.get('access-control-allow-origin')).toBe('https://mention.earth');
    expect(headers.has('access-control-allow-credentials')).toBe(false);
    expect(nextCalled).toBe(true);
  });
  test('answers a preflight itself', () => {
    const { status, nextCalled } = run('OPTIONS', 'https://mention.earth');
    expect(status).toBe(204);
    expect(nextCalled).toBe(false);
  });
  test('says nothing to an unlisted origin and never opens writes', () => {
    expect(run('GET', 'https://evil.test').headers.has('access-control-allow-origin')).toBe(false);
    expect(run('POST', 'https://mention.earth').headers.has('access-control-allow-origin')).toBe(
      false,
    );
  });
});
