import { type BunSqlClient, createDatabase, type OxyBunSqlDatabase } from '@oxy.so/db';
import * as schema from './schema';

export type Database = OxyBunSqlDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** A write that must be able to join a caller's transaction takes this. */
export type DatabaseOrTransaction = Database | Transaction;

let handle: { db: Database; client: BunSqlClient } | null = null;
let reachability: Promise<void> | null = null;

/**
 * Bun's built-in client (`Bun.SQL`). `prepare: false` is load-bearing: on a
 * prepared statement Bun 1.4.x learns a parameter is `jsonb` and JSON-encodes
 * drizzle's already-stringified value a second time, storing a jsonb STRING.
 */
const CLIENT_OPTIONS = {
  max: 10,
  idleTimeout: 0,
  maxLifetime: 60 * (30 + Math.random() * 30),
  connectionTimeout: 30,
  prepare: false,
} as const;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export function getDb(): Database {
  if (!handle) throw new Error('PostgreSQL is not connected: call connectToDatabase() at startup');
  return handle.db;
}

export function connectToDatabase(): Promise<void> {
  handle ??= createDatabase({
    databaseUrl: databaseUrl(),
    schema,
    driver: 'bun-sql',
    client: CLIENT_OPTIONS,
  });
  reachability ??= Promise.resolve(handle.client`select 1`).then(
    () => undefined,
    (error: unknown) => {
      reachability = null;
      throw error;
    },
  );
  return reachability;
}

export async function closeDatabase(): Promise<void> {
  const current = handle;
  handle = null;
  reachability = null;
  await current?.client.close();
}
