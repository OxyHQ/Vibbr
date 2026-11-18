import type { TFunction } from 'i18next';

interface ErrorBodyLike {
  status?: number;
  code?: string;
  message?: string;
  response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
}

/** The API's error code, from whichever shape the transport threw. */
export function errorCode(error: unknown): string | undefined {
  const e = error as ErrorBodyLike | null;
  return e?.response?.data?.error?.code ?? e?.code;
}

export function errorStatus(error: unknown): number | undefined {
  const e = error as ErrorBodyLike | null;
  return e?.response?.status ?? e?.status;
}

/** A sentence a person can act on. Never the raw server message of an unknown failure. */
export function errorMessage(error: unknown, t: TFunction): string {
  const code = errorCode(error);
  if (code && t(`errors.${code}`, { defaultValue: '' })) return t(`errors.${code}`);
  const status = errorStatus(error);
  if (status === undefined) return t('errors.network');
  return t('errors.generic');
}
