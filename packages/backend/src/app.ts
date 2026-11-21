import {
  createOxyAuthMiddleware,
  createOxyCors,
  createOxyRateLimit,
  createOxySecurityHeaders,
  oxyTrustProxy,
} from '@oxy.so/core/server';
import express, { type RequestHandler } from 'express';
import { type Authority, oxyAuthority } from './authority';
import { config } from './config';
import { connectToDatabase } from './db';
import { embedCors } from './middleware/embedCors';
import { actorRouter, objectRouter, webfingerRouter } from './federation/routes';
import { oxy } from './oxy';
import { type PaymentProvider, resolvePaymentProvider } from './payments/provider';
import { authedRoutes } from './routes/authed';
import { publicRoutes } from './routes/public';
import { errorHandler } from './utils/http';
import { logger } from './utils/logger';

export interface AppDependencies {
  readonly authority?: Authority;
  readonly provider?: PaymentProvider;
  readonly clock?: () => Date;
  /** Replaces Oxy's session check; tests inject a fixed identity here. */
  readonly authenticate?: RequestHandler;
  readonly connect?: () => Promise<void>;
}

/** Builds the HTTP app. It opens nothing itself: the database is reached through `connect`. */
export function createApp(deps: AppDependencies = {}): express.Express {
  const authority = deps.authority ?? oxyAuthority;
  const provider = deps.provider ?? resolvePaymentProvider();
  const clock = deps.clock ?? (() => new Date());
  const connect = deps.connect ?? connectToDatabase;

  const app = express();
  app.set('trust proxy', oxyTrustProxy);
  app.use(createOxySecurityHeaders());
  app.use(
    createOxyCors({
      appOrigins: [
        config.webOrigin,
        ...(config.production ? [] : ['http://localhost:8081', 'http://localhost:8082']),
      ],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  // ActivityPub (ADR 0002). Mounted only when switched on: before the actors resolve, an Event whose
  // attributedTo does not is rejected by remote servers, which is worse than not federating.
  if (config.federation.enabled) {
    app.use('/.well-known', webfingerRouter());
    app.use('/ap', actorRouter());
    app.use(objectRouter());
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vibbr-backend' });
  });

  // Every API answer is per caller or per moment; a shared cache must not keep one.
  app.use('/v1', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/v1', async (_req, res, next) => {
    try {
      await connect();
      next();
    } catch (error) {
      logger.error('PostgreSQL connection unavailable', error);
      res.status(503).json({
        error: { code: 'service_unavailable', message: 'Database temporarily unavailable' },
      });
    }
  });

  app.use('/v1', embedCors(config.embedOrigins), publicRoutes(clock));
  if (!deps.authenticate) app.use(createOxyRateLimit(oxy));
  app.use(
    '/v1',
    deps.authenticate ?? createOxyAuthMiddleware(oxy),
    authedRoutes({ authority, provider, clock }),
  );
  app.use('/v1', (_req, res) => {
    res.status(404).json({ error: { code: 'unknown_route', message: 'Unknown API route' } });
  });
  app.use(errorHandler);
  return app;
}
