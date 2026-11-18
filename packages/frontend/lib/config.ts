// Oxy is always the production identity provider: a build that quietly points
// identity at a port nothing listens on renders a signed-out app that simply
// does not load, which reads as a broken feed rather than a missing backend.
export const OXY_BASE_URL = process.env.EXPO_PUBLIC_OXY_BASE_URL || 'https://api.oxy.so';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://api.vibbr.co' : 'http://localhost:4120');

export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://vibbr.co';

/**
 * Vibbr's registered Oxy application id (public: it travels inside the bundle).
 * There is deliberately no committed fallback: the id comes from the build
 * environment once Vibbr is registered in oxy's first-party registry, and a
 * missing one must fail loudly instead of signing in as another application.
 */
export const OXY_CLIENT_ID = process.env.EXPO_PUBLIC_OXY_CLIENT_ID ?? '';

export const OXY_AUTH_REDIRECT_URI = process.env.EXPO_PUBLIC_OXY_AUTH_REDIRECT_URI ?? WEB_BASE_URL;

export const DEFAULT_LANGUAGE = 'en-US';
export const SUPPORTED_LANGUAGES = ['en-US', 'es-ES'] as const;
