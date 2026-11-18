import { accessErrorStatus, OxyAccessError } from '@oxy.so/core/server';
import type { ErrorCode } from '@vibbr.co/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { z } from 'zod';
import { logger } from './logger';
import { ApiException } from './errors';

/** Wraps an async handler so a rejection reaches the error handler instead of hanging the request. */
export const route =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

/** Parses a request part against a contract; a failure is a 422 that names the fields. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiException('validation_failed', 'The request is not valid', {
    fields: [...new Set(result.error.issues.map((i) => i.path.join('.') || '(body)'))].join(','),
  });
}

const ACCESS_ANSWERS = {
  401: { code: 'unauthorized', message: 'Sign in to Oxy again' },
  403: { code: 'forbidden', message: 'You may not do this for this account' },
  404: { code: 'not_found', message: 'Not found' },
  503: { code: 'service_unavailable', message: 'Oxy could not confirm your access; try again' },
} as const satisfies Record<number, { code: ErrorCode; message: string }>;

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error instanceof OxyAccessError) {
    const status = accessErrorStatus(error);
    res.status(status).json({ error: ACCESS_ANSWERS[status] });
    return;
  }
  if (error instanceof ApiException) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'bad_request', message: 'Invalid JSON request' } });
    return;
  }
  logger.error('Unhandled error', error);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
};
