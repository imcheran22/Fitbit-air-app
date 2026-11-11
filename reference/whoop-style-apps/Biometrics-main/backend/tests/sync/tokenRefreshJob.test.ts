import { randomUUID } from 'crypto';
import { runTokenRefreshSweep } from '../../src/sync/tokenRefreshJob';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { encryptToken, decryptToken } from '../../src/crypto/tokenCipher';
import * as oauth from '../../src/health/oauth';
import * as subscriber from '../../src/health/subscriber';

jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runTokenRefreshSweep', () => {
  it('refreshes connections expiring within the next hour', async () => {
    const user = await prisma.user.create({ data: { email: `t-${Date.now()}@example.com`, name: 'Test User'} });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `fb-1-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 28800,
    });

    await runTokenRefreshSweep();

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(decryptToken(conn!.encryptedAccessToken)).toBe('new-access');
  });

  it('marks a connection disconnected when the refresh token has been revoked', async () => {
    const user = await prisma.user.create({ data: { email: `t2-${Date.now()}@example.com`, name: 'Test User'} });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `fb-2-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));

    await runTokenRefreshSweep();

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('DISCONNECTED');
  });

  // The server being offline for a moment (DNS failure, Google 5xx) says nothing
  // about the grant; disconnecting here forced the user to reconnect by hand.
  it.each([
    ['a network failure', new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com')],
    ['a Google 5xx', Object.assign(new Error('Google token endpoint returned 503'), { status: 503 })],
    // A bad or rotated client secret is the app's fault, not the user's grant.
    ['an invalid_client answer', Object.assign(new Error('Google token endpoint returned 401'), { status: 401, oauthError: 'invalid_client' })],
  ])('keeps the connection and its subscription on %s', async (_label, failure) => {
    const user = await prisma.user.create({ data: { email: `t-net-${randomUUID()}@example.com`, name: 'Test User' } });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `fb-net-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        webhookSubscriptionId: `sub-net-${randomUUID()}`,
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(failure);
    (subscriber.deleteUserSubscription as jest.Mock).mockClear();

    await runTokenRefreshSweep();

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(decryptToken(conn!.encryptedAccessToken)).toBe('old-access');
    expect(subscriber.deleteUserSubscription).not.toHaveBeenCalled();
  });

  // A transient DB failure after a successful refresh must not be mistaken for
  // a revoked grant; the connection is healthy and should stay CONNECTED.
  it('does not disconnect a healthy connection when the post-refresh write fails', async () => {
    const user = await prisma.user.create({
      data: { email: `t4-${Date.now()}@example.com`, name: 'Test User'},
    });
    const created = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `fb-4-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 28800,
    });

    // Fail only this connection's write, so the assertion does not depend on
    // how many other connections the sweep happens to pick up.
    const realUpdate = prisma.healthConnection.update.bind(prisma.healthConnection);
    const updateSpy = jest
      .spyOn(prisma.healthConnection, 'update')
      .mockImplementation((args: any) =>
        args?.where?.id === created.id
          ? (Promise.reject(new Error('transient db failure')) as any)
          : realUpdate(args),
      );

    // The write failure is rethrown rather than swallowed into a disconnect.
    await expect(runTokenRefreshSweep()).rejects.toThrow('transient db failure');
    updateSpy.mockRestore();

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
  });

  it('isolates a failing connection so other connections in the same sweep still refresh', async () => {
    const failingUser = await prisma.user.create({
      data: { email: `t3-fail-${Date.now()}@example.com`, name: 'Test User'},
    });
    const succeedingUser = await prisma.user.create({
      data: { email: `t3-ok-${Date.now()}@example.com`, name: 'Test User'},
    });
    await prisma.healthConnection.create({
      data: {
        userId: failingUser.id,
        healthUserId: `fb-3-fail-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access-fail'),
        encryptedRefreshToken: encryptToken('old-refresh-fail'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    await prisma.healthConnection.create({
      data: {
        userId: succeedingUser.id,
        healthUserId: `fb-3-ok-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access-ok'),
        encryptedRefreshToken: encryptToken('old-refresh-ok'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    (oauth.refreshHealthTokens as jest.Mock).mockImplementation((refreshToken: string) => {
      if (refreshToken === 'old-refresh-fail') {
        return Promise.reject(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));
      }
      return Promise.resolve({
        accessToken: 'new-access-ok',
        refreshToken: 'new-refresh-ok',
        expiresIn: 28800,
      });
    });

    await runTokenRefreshSweep();

    const failingConn = await prisma.healthConnection.findUnique({ where: { userId: failingUser.id } });
    const succeedingConn = await prisma.healthConnection.findUnique({ where: { userId: succeedingUser.id } });

    expect(failingConn?.status).toBe('DISCONNECTED');
    expect(succeedingConn?.status).toBe('CONNECTED');
    expect(decryptToken(succeedingConn!.encryptedAccessToken)).toBe('new-access-ok');
  });

  it('does not overwrite the stored refresh token when Google does not return a new one', async () => {
    const user = await prisma.user.create({ data: { email: `t-${Date.now()}-norefresh@example.com`, name: 'Test User'} });
    const conn = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-user-norefresh-${randomUUID()}`,
        encryptedAccessToken: 'old-access',
        encryptedRefreshToken: encryptToken('original-refresh-token'),
        tokenExpiresAt: new Date(Date.now() - 1000),
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'new-access', expiresIn: 3599 });

    await runTokenRefreshSweep();

    const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
    expect(decryptToken(updated!.encryptedRefreshToken)).toBe('original-refresh-token');
    expect(decryptToken(updated!.encryptedAccessToken)).toBe('new-access');
  });

  it('deletes the Google Health subscription when a refresh fails and a subscription exists', async () => {
    const user = await prisma.user.create({
      data: { email: `t-${Date.now()}-refresh401@example.com`, name: 'Test User'},
    });
    const conn = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-user-refresh401-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        webhookSubscriptionId: 'sub-to-delete-on-refresh-fail',
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));
    (subscriber.deleteUserSubscription as jest.Mock).mockResolvedValue(undefined);

    await runTokenRefreshSweep();

    expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-to-delete-on-refresh-fail');
    const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
    expect(updated?.status).toBe('DISCONNECTED');
  });

  it('still marks the connection DISCONNECTED on refresh failure even if deleting the subscription fails', async () => {
    const user = await prisma.user.create({
      data: { email: `t-${Date.now()}-refresh402@example.com`, name: 'Test User'},
    });
    const conn = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-user-refresh402-${randomUUID()}`,
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        webhookSubscriptionId: 'sub-that-fails-on-refresh',
      },
    });
    (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));
    (subscriber.deleteUserSubscription as jest.Mock).mockRejectedValue(new Error('network error'));

    await runTokenRefreshSweep();

    const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
    expect(updated?.status).toBe('DISCONNECTED');
  });
});
