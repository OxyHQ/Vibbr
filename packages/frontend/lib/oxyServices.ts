import { OxyServices } from '@oxy.so/core';
import { OXY_BASE_URL } from './config';

/**
 * The one OxyServices instance. It is the same one OxyProvider receives, and
 * session restore belongs entirely to OxyProvider's cold boot.
 */
export const oxyServices = new OxyServices({ baseURL: OXY_BASE_URL });
