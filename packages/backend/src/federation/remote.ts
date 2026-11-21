import { safeFetch } from '@oxy.so/core/server';
import { config } from '../config';

const MAX_DOCUMENT_BYTES = 256 * 1024;
const ACCEPT = 'application/activity+json, application/ld+json';

/** An https URL on a host other than our own: the only kind of remote address Vibbr ever follows. */
export function isRemoteHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname !== config.federation.domain
    );
  } catch {
    return false;
  }
}

async function readBounded(stream: AsyncIterable<Buffer | string>): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_DOCUMENT_BYTES) throw new Error('remote document too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads a remote ActivityPub document (an actor, a key). Single hop, SSRF-checked by core's
 * `safeFetch` (it refuses private addresses and pins the resolved IP), bounded in size and time.
 */
export async function fetchRemoteDocument(url: string): Promise<Record<string, unknown> | null> {
  if (!isRemoteHttpsUrl(url)) return null;
  const { response, status } = await safeFetch(url, {
    method: 'GET',
    headers: { accept: ACCEPT, 'user-agent': 'Vibbr (+https://vibbr.co)' },
    redirect: 'manual',
    maxRedirects: 0,
    headersTimeoutMs: 8_000,
    signal: AbortSignal.timeout(10_000),
  });
  if (status !== 200) {
    response.destroy();
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(await readBounded(response));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
