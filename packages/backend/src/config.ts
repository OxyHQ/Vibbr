function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const production = process.env.NODE_ENV === 'production';

export const config = {
  production,
  port: Number(process.env.PORT ?? 3000),
  webOrigin: (process.env.FRONTEND_URL ?? 'https://vibbr.co').replace(/\/+$/, ''),
  /** HMAC key for admission codes. A shared dev key is acceptable only outside production. */
  ticketCodeSecret(): string {
    const secret = process.env.TICKET_CODE_SECRET;
    if (secret) {
      if (secret.length < 32) throw new Error('TICKET_CODE_SECRET must be at least 32 characters');
      return secret;
    }
    if (production) return required('TICKET_CODE_SECRET');
    return 'vibbr-development-ticket-code-secret-not-for-production';
  },
  /** First-party sites that may read public event data from the browser (Mention's event cards). */
  embedOrigins: ['https://mention.earth', 'https://www.mention.earth'],
  /** Minutes an unpaid online reservation holds its tickets. */
  reservationMinutes: 15,
  /** Minutes a waitlist offer holds its tickets. */
  waitlistOfferMinutes: 15,
} as const;

export function eventUrl(publicId: string): string {
  return `${config.webOrigin}/e/${publicId}`;
}
