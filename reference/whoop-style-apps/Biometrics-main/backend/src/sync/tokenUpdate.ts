import type { HealthTokenResponse } from '../health/oauth';
import { encryptToken } from '../crypto/tokenCipher';

/**
 * True only when Google's token endpoint answered and refused this user's
 * refresh token (400 invalid_grant). Anything else -- DNS failure, timeout, a
 * 5xx, or the app's own credentials being wrong (401 invalid_client) -- says
 * nothing about the grant, so the connection must be kept and the refresh
 * tried again later rather than the user being disconnected.
 */
export function isRevokedGrant(err: unknown): boolean {
  const e = err as { status?: unknown; oauthError?: unknown } | null;
  return e?.status === 400 && e.oauthError === 'invalid_grant';
}

export interface RefreshedTokenUpdate {
  encryptedAccessToken: string;
  tokenExpiresAt: Date;
  encryptedRefreshToken?: string;
}

/**
 * Builds the Prisma update payload for a HealthConnection after a successful
 * token refresh. Shared by the scheduled refresh sweep and the sync worker's
 * on-401 refresh so both persist tokens the same way.
 *
 * Google does not return a new refresh_token on an ordinary refresh call --
 * only exchangeCodeForTokens does. Overwriting a present encryptedRefreshToken
 * with an absent one would destroy the only credential capable of any future
 * refresh, so encryptedRefreshToken is only included when Google actually
 * sent one.
 */
export function refreshedTokenUpdateData(tokens: HealthTokenResponse): RefreshedTokenUpdate {
  const data: RefreshedTokenUpdate = {
    encryptedAccessToken: encryptToken(tokens.accessToken),
    tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
  };
  if (tokens.refreshToken) {
    data.encryptedRefreshToken = encryptToken(tokens.refreshToken);
  }
  return data;
}
