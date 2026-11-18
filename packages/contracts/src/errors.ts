import { z } from 'zod';

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'unknown_route',
  'gone',
  'conflict',
  'validation_failed',
  'rate_limited',
  'sold_out',
  'sale_closed',
  'limit_exceeded',
  'revision_conflict',
  'payment_unavailable',
  'internal_error',
  'service_unavailable',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
