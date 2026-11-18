import { createApp } from './src/app';
import { config } from './src/config';
import { closeDatabase, connectToDatabase } from './src/db';
import { startHousekeeping } from './src/jobs';
import { logger } from './src/utils/logger';

async function main(): Promise<void> {
  // Fail at boot, not on the first ticket: the code secret and the database.
  config.ticketCodeSecret();
  await connectToDatabase();

  const app = createApp();
  const server = app.listen(config.port, () =>
    logger.info(`Vibbr backend listening on ${config.port}`),
  );
  const stopHousekeeping = startHousekeeping();

  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Received ${signal}; stopping Vibbr backend`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    stopHousekeeping();
    server.close(() => {
      closeDatabase()
        .catch((error: unknown) => logger.error('Closing the database failed', error))
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  logger.error('Vibbr backend failed to start', error);
  process.exit(1);
});
