import { getRequiredOxyUserId, type OxyAuthRequest } from '@oxy.so/core/server';
import type { Request } from 'express';
import { oxy } from './oxy';
import { forbidden } from './utils/errors';

/**
 * Who is calling and for whom. Authority over an organization is read live from
 * Oxy with the caller's own bearer, never mirrored in a Vibbr table: a revoked
 * membership stops counting on the next write. A write asks fresh; a read may
 * reuse an answer for 30 s. An Oxy outage is a 503, never a remembered "no".
 */
export interface Authority {
  /** The signed-in Oxy account id of the caller. */
  callerId(req: Request): string;
  /** Throws unless the caller is `oxyAccountId` or may act as that organization. */
  assertActsFor(req: Request, oxyAccountId: string): Promise<void>;
}

export const oxyAuthority: Authority = {
  callerId: (req) => getRequiredOxyUserId(req),
  async assertActsFor(req, oxyAccountId) {
    if (getRequiredOxyUserId(req) === oxyAccountId) return;
    const access = await oxy.accountAccessFor(req as OxyAuthRequest, oxyAccountId, {
      fresh: req.method !== 'GET',
    });
    if (access.kind !== 'organization' || !access.has('account:act_as')) {
      throw forbidden('Organization membership is required');
    }
  },
};
