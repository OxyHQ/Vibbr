import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';

// Federation is off unless this is set when the config loads; Oxy's key custody is not reachable here.
process.env.FEDERATION_ENABLED = 'true';
mock.module('./keys', () => ({
  getPublicKey: async (username: string) => ({
    keyId: `https://vibbr.co/ap/users/${username}#main-key`,
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
  }),
  signViaOxy: async () => 'signature',
}));

import { organizers } from '../db/schema';
import { EVENT_START, NOW } from '../testing/fixtures';
import { createTestDatabase, TEST_DATABASE_URL } from '../testing/database';

const AP = { accept: 'application/activity+json' };

describe.skipIf(!TEST_DATABASE_URL)('federation routes (real Postgres, real engine)', () => {
  let drop: () => Promise<void>;
  let server: Server;
  let base: string;
  let handle: string;
  let hiddenHandle: string;

  beforeAll(async () => {
    // Imported here, after the flag above: the config reads it once, when it first loads.
    const { createApp } = await import('../app.js');
    const { getDb } = await import('../db/index.js');
    const { noCollectionProvider } = await import('../payments/provider.js');
    const { makeOrganizer, makePublishedEvent, makeVenue } = await import('../testing/fixtures.js');
    ({ drop } = await createTestDatabase());
    const organizer = await makeOrganizer();
    const hidden = await makeOrganizer();
    handle = organizer.handle;
    hiddenHandle = hidden.handle;
    await getDb().update(organizers).set({ federated: true }).where(eq(organizers.handle, handle));
    const venue = await makeVenue();
    await makePublishedEvent(organizer.id, venue.id);

    const app = createApp({
      provider: noCollectionProvider,
      clock: () => NOW,
      authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
      connect: async () => undefined,
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    server?.close();
    await drop?.();
  });

  test('an organizer that opted in resolves, serves an actor and an outbox of its events; one that did not is absent', async () => {
    const finger = await fetch(`${base}/.well-known/webfinger?resource=acct:${handle}@vibbr.co`);
    expect(finger.status).toBe(200);
    const jrd = (await finger.json()) as { links: { rel: string; href: string }[] };
    expect(jrd.links.find((l) => l.rel === 'self')?.href).toBe(
      `https://vibbr.co/ap/users/${handle}`,
    );

    const actor = await fetch(`${base}/ap/users/${handle}`, { headers: AP });
    expect(actor.status).toBe(200);
    const doc = (await actor.json()) as { type: string; publicKey: { id: string } };
    expect(doc.type).toBe('Organization');
    expect(doc.publicKey.id).toBe(`https://vibbr.co/ap/users/${handle}#main-key`);

    const outbox = await fetch(`${base}/ap/users/${handle}/outbox`);
    const items = (
      (await outbox.json()) as {
        orderedItems: {
          type: string;
          actor: string;
          object: { type: string; startTime: string; attributedTo: string };
        }[];
      }
    ).orderedItems;
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe('Create');
    expect(items[0]?.actor).toBe(`https://vibbr.co/ap/users/${handle}`);
    expect(items[0]?.object.attributedTo).toBe(`https://vibbr.co/ap/users/${handle}`);
    expect(items[0]?.object.type).toBe('Event');
    expect(items[0]?.object.startTime).toBe(EVENT_START);

    const hiddenFinger = await fetch(
      `${base}/.well-known/webfinger?resource=acct:${hiddenHandle}@vibbr.co`,
    );
    expect(hiddenFinger.status).toBe(404);
    expect((await fetch(`${base}/ap/users/${hiddenHandle}`, { headers: AP })).status).toBe(404);
  });
});
