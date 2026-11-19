import type { RequestHandler } from 'express';

/**
 * Lets a first-party site read PUBLIC event data from the browser: Mention shows
 * an event card inside a post and fetches it from here. GET only, no credentials,
 * so the caller's cookies and bearer never ride along; everything that writes
 * stays behind `createOxyCors`' own origin list.
 */
export function embedCors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get('origin');
    res.vary('Origin');
    if (origin && allowed.has(origin) && (req.method === 'GET' || req.method === 'OPTIONS')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'accept, content-type');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  };
}
