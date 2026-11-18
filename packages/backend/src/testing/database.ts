import { join } from 'node:path';
import { runMigrations } from '@oxy.so/db/migrate';
import { SQL } from 'bun';
import { closeDatabase, connectToDatabase } from '../db';

/** A server to create throwaway databases on. Tests that need Postgres skip without it. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const MIGRATIONS = join(__dirname, '..', '..', 'drizzle');

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/**
 * Creates an empty database, applies the real migrations to it and points the
 * app at it. The migrations are the only schema there is: a test never builds
 * tables by any other route.
 */
export async function createTestDatabase(): Promise<{ name: string; drop(): Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const name = `vibbr_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new SQL(withDatabase(TEST_DATABASE_URL, 'postgres'));
  await admin.unsafe(`create database ${name}`);
  await admin.close();

  const databaseUrl = withDatabase(TEST_DATABASE_URL, name);
  await runMigrations({
    databaseUrl,
    driver: 'bun-sql',
    migrationsFolder: MIGRATIONS,
    extensions: [],
    run: 'all',
    expectedDatabase: name,
    dryRun: false,
    logger: { info: () => undefined, debug: () => undefined },
  });

  process.env.DATABASE_URL = databaseUrl;
  await connectToDatabase();
  return {
    name,
    async drop() {
      await closeDatabase();
      const cleanup = new SQL(withDatabase(TEST_DATABASE_URL, 'postgres'));
      await cleanup.unsafe(`drop database if exists ${name} with (force)`);
      await cleanup.close();
    },
  };
}
