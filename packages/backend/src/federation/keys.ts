import { config } from '../config';
import { oxy } from '../oxy';

/**
 * Key custody. The private key of an actor NEVER enters Vibbr: Oxy holds it and signs on request
 * (`/federation/sign`), the way Mention does. The key is scoped to (username, domain), and Oxy only
 * answers for a domain the application is registered for, so `vibbr.co` has to be one of its origins.
 */
export interface ActorPublicKey {
  readonly keyId: string;
  readonly publicKeyPem: string;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export async function getPublicKey(username: string): Promise<ActorPublicKey> {
  const path = `/federation/public-key/${encodeURIComponent(username)}?domain=${encodeURIComponent(config.federation.domain)}`;
  const response = await oxy.serviceRequest<{ keyId?: unknown; publicKeyPem?: unknown }>(
    'GET',
    path,
  );
  if (!isText(response?.keyId) || !isText(response?.publicKeyPem)) {
    throw new Error('Malformed federation public-key response');
  }
  return { keyId: response.keyId, publicKeyPem: response.publicKeyPem };
}

export async function signViaOxy(keyId: string, signingString: string): Promise<string> {
  const response = await oxy.serviceRequest<{ signature?: unknown }>('POST', '/federation/sign', {
    keyId,
    signingString,
  });
  if (!isText(response?.signature)) throw new Error('Malformed federation signing response');
  return response.signature;
}
