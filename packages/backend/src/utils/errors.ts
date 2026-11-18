import type { ErrorCode } from '@vibbr.co/contracts';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  unknown_route: 404,
  gone: 410,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  sold_out: 409,
  sale_closed: 409,
  limit_exceeded: 409,
  revision_conflict: 409,
  payment_unavailable: 409,
  internal_error: 500,
  service_unavailable: 503,
};

/** An answer the caller can act on. Anything else is a 500 that says nothing. */
export class ApiException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = 'ApiException';
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new ApiException('not_found', `${what} not found`);
export const forbidden = (message = 'Not allowed') => new ApiException('forbidden', message);
