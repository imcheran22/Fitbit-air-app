import { timingSafeEqual } from 'crypto';

export function isValidWebhookAuthorization(authorizationHeader: string | undefined): boolean {
  if (!authorizationHeader) return false;
  const expected = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
  if (!expected) throw new Error('GOOGLE_HEALTH_WEBHOOK_SECRET is not set');

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(authorizationHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
