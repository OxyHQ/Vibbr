import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { Request } from 'express';
import type { Authority } from '../authority';
import { createApp } from '../app';
import { noCollectionProvider } from '../payments/provider';
import { createTestDatabase, TEST_DATABASE_URL } from '../testing/database';
import { must } from '../testing/must';
import { forbidden } from '../utils/errors';
import { NOW } from '../testing/fixtures';

/** Identity comes from a header; an organization's owner account acts for it. */
const authority: Authority = {
  callerId: (req: Request) => {
    const id = req.get('x-test-user');
    if (!id) throw Object.assign(new Error('no user'), { status: 401 });
    return id;
  },
  async assertActsFor(req, oxyAccountId) {
    if (this.callerId(req) !== oxyAccountId) throw forbidden();
  },
};

interface Json {
  id: string;
  code: string;
  title?: string;
  items: unknown[];
  tickets: { id: string }[];
}

describe.skipIf(!TEST_DATABASE_URL)('HTTP API (real Postgres)', () => {
  let drop: () => Promise<void>;
  let server: Server;
  let base: string;

  const call = async (
    method: string,
    path: string,
    user: string | null,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(user && { 'x-test-user': user }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Json) : null,
    };
  };

  beforeAll(async () => {
    ({ drop } = await createTestDatabase());
    const app = createApp({
      authority,
      provider: noCollectionProvider,
      clock: () => NOW,
      authenticate: (_req, _res, next) => next(),
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

  test('an organizer publishes an event, a buyer reserves, the door admits, a draft stays private', async () => {
    const org = await call('POST', '/v1/organizers', 'owner-http', {
      kind: 'company',
      name: 'Sala X',
      handle: 'sala_x',
    });
    expect(org.status).toBe(201);
    const venue = await call('POST', '/v1/venues', 'owner-http', {
      name: 'Sala X',
      addressLine: null,
      city: 'Madrid',
      region: null,
      countryCode: 'ES',
      timeZone: 'Europe/Madrid',
      location: null,
      capacity: null,
    });
    const draft = await call('POST', '/v1/events', 'owner-http', {
      organizerId: must(org.body).id,
      title: 'Show',
      category: 'music',
      timeZone: 'Europe/Madrid',
      startsAt: '2026-12-24T20:00:00.000Z',
      place: { mode: 'in_person', venueId: must(venue.body).id, onlineUrl: null },
    });
    expect(draft.status).toBe(201);
    const id = must(draft.body).id as string;

    // A draft is invisible to everyone but its organizer.
    expect((await call('GET', `/v1/events/${id}`, null)).status).toBe(404);
    expect((await call('GET', `/v1/manage/events/${id}`, 'owner-http')).status).toBe(200);
    expect((await call('GET', `/v1/manage/events/${id}`, 'stranger')).status).toBe(403);
    expect(
      (
        await call('PATCH', `/v1/events/${id}`, 'stranger', {
          revision: 0,
          changes: { title: 'x' },
        })
      ).status,
    ).toBe(403);

    const type = await call('POST', `/v1/events/${id}/ticket-types`, 'owner-http', {
      name: 'General',
      priceAmount: '1000',
      currency: 'EUR',
      paymentMode: 'door',
      quota: 5,
    });
    expect(type.status).toBe(201);
    expect(
      (await call('POST', `/v1/events/${id}/publish`, 'owner-http', { revision: 0 })).status,
    ).toBe(200);

    const card = await call('GET', `/v1/events/${id}/card`, null);
    expect(card.body).toMatchObject({
      title: 'Show',
      free: false,
      soldOut: false,
      priceFrom: { amount: '1000', currency: 'EUR' },
    });
    expect(must((await call('GET', `/v1/events/cards?ids=${id}`, null)).body).items).toHaveLength(
      1,
    );

    const body = { eventId: id, lines: [{ ticketTypeId: must(type.body).id, quantity: 1 }] };
    expect((await call('POST', '/v1/orders', 'buyer-http', body)).status).toBe(400); // no Idempotency-Key
    const bought = await call('POST', '/v1/orders', 'buyer-http', body, {
      'idempotency-key': 'http-key-0001',
    });
    expect(bought.status).toBe(201);
    const ticketId = must(must(bought.body).tickets[0]).id;
    expect((await call('GET', `/v1/orders/${must(bought.body).id}`, 'someone-else')).status).toBe(
      404,
    );

    const code = await call('GET', `/v1/tickets/${ticketId}/code`, 'buyer-http');
    expect(code.status).toBe(200);
    expect((await call('GET', `/v1/tickets/${ticketId}/code`, 'someone-else')).status).toBe(404);

    // Only the organizer (or staff) may scan.
    const scan = { eventId: id, code: must(code.body).code };
    expect((await call('POST', '/v1/scan', 'buyer-http', scan)).status).toBe(403);
    expect((await call('POST', '/v1/scan', 'owner-http', scan)).body).toMatchObject({
      result: 'admitted',
    });
    expect((await call('POST', '/v1/scan', 'owner-http', scan)).body).toMatchObject({
      result: 'already_used',
    });

    expect((await call('GET', '/v1/events?city=Madrid', null)).status).toBe(200);
    expect((await call('GET', '/v1/events?limit=0', null)).status).toBe(422);
    expect((await call('GET', '/v1/nope', null)).status).toBe(404);
  });
});
