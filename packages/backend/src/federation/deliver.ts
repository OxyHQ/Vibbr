import { signRequest } from '@oxy.so/federation';
import { safeFetch } from '@oxy.so/core/server';
import { getPublicKey, signViaOxy } from './keys';
import { isRemoteHttpsUrl } from './remote';

const AP_CONTENT_TYPE = 'application/activity+json';

export class DeliveryError extends Error {
  constructor(
    message: string,
    /** A 4xx other than 408/429 will not succeed on retry. */
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

/**
 * One signed POST of an activity to a remote inbox. The signature is made by Oxy (the key never
 * leaves it); the request goes through core's SSRF-checked `safeFetch`, one hop, no redirects.
 */
export async function postActivity(
  handle: string,
  inboxUrl: string,
  activity: Record<string, unknown>,
): Promise<void> {
  if (!isRemoteHttpsUrl(inboxUrl)) throw new DeliveryError('inbox is not a remote https URL', true);
  const body = JSON.stringify(activity);
  const { keyId } = await getPublicKey(handle);
  const headers = await signRequest(signViaOxy, keyId, 'POST', inboxUrl, body, {
    contentType: AP_CONTENT_TYPE,
  });
  const { response, status } = await safeFetch(inboxUrl, {
    method: 'POST',
    headers: { ...headers, 'user-agent': 'Vibbr (+https://vibbr.co)' },
    body,
    redirect: 'manual',
    maxRedirects: 0,
    headersTimeoutMs: 8_000,
    signal: AbortSignal.timeout(15_000),
  });
  response.destroy();
  if (status >= 200 && status < 300) return;
  const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
  throw new DeliveryError(`inbox answered ${status}`, permanent);
}
