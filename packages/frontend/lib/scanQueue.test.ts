import { describe, expect, test } from '@jest/globals';
import { type QueueStorage, ScanQueue } from './scanQueue';

function memory(): QueueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

const scan = (code: string, at = '2026-12-01T20:00:00.000Z') => ({ code, scannedAt: at });

describe('ScanQueue', () => {
  test('persists and reloads', async () => {
    const storage = memory();
    const a = new ScanQueue(storage, 'q');
    await a.add(scan('one'));
    await a.add(scan('two'));
    const b = new ScanQueue(storage, 'q');
    expect(await b.size()).toBe(2);
  });

  test('a code read twice is queued once', async () => {
    const q = new ScanQueue(memory(), 'q');
    await q.add(scan('one'));
    await q.add(scan('one', '2026-12-01T20:00:05.000Z'));
    expect(await q.size()).toBe(1);
  });

  test('flush sends in order and clears what was accepted', async () => {
    const q = new ScanQueue(memory(), 'q');
    await q.add(scan('a'));
    await q.add(scan('b'));
    const seen: string[][] = [];
    expect(await q.flush(async (batch) => void seen.push(batch.map((s) => s.code)))).toBe(2);
    expect(seen).toEqual([['a', 'b']]);
    expect(await q.size()).toBe(0);
  });

  test('a failed flush keeps everything for the next try', async () => {
    const q = new ScanQueue(memory(), 'q');
    await q.add(scan('a'));
    await expect(q.flush(async () => Promise.reject(new Error('offline')))).rejects.toThrow(
      'offline',
    );
    expect(await q.size()).toBe(1);
  });

  test('survives corrupt storage', async () => {
    const storage = memory();
    storage.data.set('q', '{not json');
    expect(await new ScanQueue(storage, 'q').size()).toBe(0);
  });
});
