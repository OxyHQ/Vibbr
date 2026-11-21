import { createUrlBuilders } from '@oxy.so/federation';
import { config } from '../config';

/** The shapes of every actor URL, bound to Vibbr's own domain (the actor and the host are the same). */
export const federationUrls = createUrlBuilders(config.federation.domain, config.federation.domain);
