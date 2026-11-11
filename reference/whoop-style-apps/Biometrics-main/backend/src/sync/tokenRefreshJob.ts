import { prisma } from '../db/client';
import { refreshHealthTokens } from '../health/oauth';
import { deleteUserSubscription } from '../health/subscriber';
import { decryptToken } from '../crypto/tokenCipher';
import { isRevokedGrant, refreshedTokenUpdateData } from './tokenUpdate';

const REFRESH_LOOKAHEAD_MS = 60 * 60 * 1000; // refresh anything expiring within the next hour

export async function runTokenRefreshSweep(): Promise<void> {
  const expiringSoon = await prisma.healthConnection.findMany({
    where: {
      status: 'CONNECTED',
      tokenExpiresAt: { lt: new Date(Date.now() + REFRESH_LOOKAHEAD_MS) },
    },
  });

  for (const conn of expiringSoon) {
    // Only a failure of the refresh itself means the connection is genuinely
    // dead. A failure of the DB write afterwards is a transient infrastructure
    // problem and must not disconnect a perfectly healthy connection.
    let tokens;
    try {
      const refreshToken = decryptToken(conn.encryptedRefreshToken);
      tokens = await refreshHealthTokens(refreshToken);
    } catch (err) {
      console.error(`Google Health token refresh failed for connection ${conn.id}`, err);
      // A network or 5xx failure is retried by the next sweep; only Google
      // refusing the grant means the user has to reconnect.
      if (!isRevokedGrant(err)) continue;
      await prisma.healthConnection.update({
        where: { id: conn.id },
        data: { status: 'DISCONNECTED' },
      });
      if (conn.webhookSubscriptionId) {
        try {
          await deleteUserSubscription(conn.webhookSubscriptionId);
        } catch (deleteErr) {
          console.error(`Failed to delete Google Health subscription ${conn.webhookSubscriptionId}`, deleteErr);
        }
      }
      continue;
    }

    try {
      // refreshedTokenUpdateData only touches encryptedRefreshToken when Google
      // actually returned a new refresh token (see its doc comment).
      await prisma.healthConnection.update({
        where: { id: conn.id },
        data: refreshedTokenUpdateData(tokens),
      });
    } catch (err) {
      // The refresh succeeded, so the connection is fine; surface the write
      // failure instead of silently marking the user disconnected.
      console.error(`Failed to persist refreshed Google Health tokens for connection ${conn.id}`, err);
      throw err;
    }
  }
}
