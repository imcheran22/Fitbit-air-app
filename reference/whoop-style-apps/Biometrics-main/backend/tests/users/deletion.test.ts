import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { USER_OWNED_MODELS, deleteUserAccount } from '../../src/users/deletion';
import { computeDailyScore } from '../../src/scoring/compute';
import { runHabitCorrelations } from '../../src/habits/job';
import { processSyncJob } from '../../src/sync/worker';
import { connection } from '../../src/sync/queue';
import { seedHistory } from '../scoring/dbHelpers';
import { countOwnedRows, createUserWithEmail, seedAllOwnedRows, totalRows } from './ownedData';

jest.mock('../../src/health/client');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const newUser = () => createUserWithEmail(`del-${randomUUID()}@example.com`);

describe('USER_OWNED_MODELS coverage guard', () => {
  const userModels = Prisma.dmmf.datamodel.models.filter((m) => m.name !== 'User');
  const modelsWithUserId = userModels.filter((m) => m.fields.some((f) => f.name === 'userId')).map((m) => m.name);

  it('lists every model that has a userId column, so a new table cannot outlive its user', () => {
    const missing = modelsWithUserId.filter((name) => !(USER_OWNED_MODELS as readonly string[]).includes(name));
    expect(missing).toEqual([]);
  });

  it('lists only real models that have a userId and a `user` relation (the purge filters through it), each once', () => {
    expect(new Set(USER_OWNED_MODELS).size).toBe(USER_OWNED_MODELS.length);
    for (const name of USER_OWNED_MODELS) {
      const model = userModels.find((m) => m.name === name);
      expect(model).toBeDefined();
      expect(model!.fields.find((f) => f.name === 'userId')).toBeDefined();
      expect(model!.fields.find((f) => f.name === 'user')?.relationName).toBeDefined();
    }
  });

  it('deletes a model before any model it references (CoachMessage references CoachConversation)', () => {
    expect(USER_OWNED_MODELS.indexOf('CoachMessage')).toBeLessThan(USER_OWNED_MODELS.indexOf('CoachConversation'));
  });

  it('is satisfied by the seed helper: every owned table gets a row', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    const counts = await countOwnedRows(user.id);
    expect(Object.keys(counts).sort()).toEqual([...USER_OWNED_MODELS].sort());
    expect(Object.entries(counts).filter(([, n]) => n < 1)).toEqual([]);
    await deleteUserAccount(user.id, { deleteSubscription: async () => {}, revokeToken: async () => {} });
  });
});

describe('deleteUserAccount', () => {
  const noopDeps = () => ({
    deleteSubscription: jest.fn().mockResolvedValue(undefined),
    revokeToken: jest.fn().mockResolvedValue(undefined),
    log: jest.fn(),
  });

  it('removes every row the user owns and the user, leaving a second user completely untouched', async () => {
    const doomed = await newUser();
    const bystander = await newUser();
    await seedAllOwnedRows(doomed.id);
    await seedAllOwnedRows(bystander.id);
    const bystanderBefore = await countOwnedRows(bystander.id);
    expect(Object.values(bystanderBefore).every((n) => n === 1)).toBe(true);
    expect(Object.entries(await countOwnedRows(doomed.id)).filter(([, n]) => n < 1)).toEqual([]);

    const summary = await deleteUserAccount(doomed.id, noopDeps());

    expect(await prisma.user.findUnique({ where: { id: doomed.id } })).toBeNull();
    expect(totalRows(await countOwnedRows(doomed.id))).toBe(0);
    for (const model of USER_OWNED_MODELS) expect([model, summary.counts[model]]).toEqual([model, 1]);
    expect(summary.counts.User).toBe(1);

    expect(await prisma.user.findUnique({ where: { id: bystander.id } })).not.toBeNull();
    expect(await countOwnedRows(bystander.id)).toEqual(bystanderBefore);
  });

  it('deletes the webhook subscription and revokes the DECRYPTED refresh token at Google, in memory only', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id, { refreshToken: 'plain-refresh-token-1', subscriptionId: 'sub-42' });
    const deps = noopDeps();

    const summary = await deleteUserAccount(user.id, deps);

    expect(deps.deleteSubscription).toHaveBeenCalledTimes(1);
    expect(deps.deleteSubscription).toHaveBeenCalledWith('sub-42');
    expect(deps.revokeToken).toHaveBeenCalledTimes(1);
    expect(deps.revokeToken).toHaveBeenCalledWith('plain-refresh-token-1');
    expect(summary).toMatchObject({ googleSubscriptionDeleted: true, googleTokenRevoked: true });
    expect(deps.log).not.toHaveBeenCalled();
  });

  it('skips the subscription call when the connection has none, but still revokes the token', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id, { subscriptionId: null });
    const deps = noopDeps();

    await deleteUserAccount(user.id, deps);

    expect(deps.deleteSubscription).not.toHaveBeenCalled();
    expect(deps.revokeToken).toHaveBeenCalledTimes(1);
  });

  it('still deletes everything locally when both Google calls fail, and logs no secret', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id, { refreshToken: 'super-secret-refresh', subscriptionId: 'sub-9' });
    const deps = {
      deleteSubscription: jest.fn().mockRejectedValue(new Error('Failed to delete Google Health subscription: 503')),
      revokeToken: jest.fn().mockRejectedValue(new Error('Google token revocation returned 400')),
      log: jest.fn(),
    };

    const summary = await deleteUserAccount(user.id, deps);

    expect(summary).toMatchObject({ googleSubscriptionDeleted: false, googleTokenRevoked: false });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(totalRows(await countOwnedRows(user.id))).toBe(0);
    expect(deps.log).toHaveBeenCalledTimes(2);
    const logged = deps.log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('super-secret-refresh');
    expect(logged).toContain('503');
    expect(logged).toContain('400');
  });

  it('a failed subscription delete does not stop the token revoke (and vice versa)', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    const deps = { ...noopDeps(), deleteSubscription: jest.fn().mockRejectedValue(new Error('boom')) };

    const summary = await deleteUserAccount(user.id, deps);

    expect(deps.revokeToken).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ googleSubscriptionDeleted: false, googleTokenRevoked: true });
  });

  it('survives a stored token that cannot be decrypted (logs, skips the revoke, deletes locally)', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    await prisma.healthConnection.update({ where: { userId: user.id }, data: { encryptedRefreshToken: 'not-valid-ciphertext' } });
    const deps = noopDeps();

    await deleteUserAccount(user.id, deps);

    expect(deps.revokeToken).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledTimes(1);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('works for a user with no HealthConnection and makes no Google call', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    await prisma.healthConnection.delete({ where: { userId: user.id } });
    const deps = noopDeps();

    const summary = await deleteUserAccount(user.id, deps);

    expect(deps.deleteSubscription).not.toHaveBeenCalled();
    expect(deps.revokeToken).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ googleSubscriptionDeleted: false, googleTokenRevoked: false });
    expect(summary.counts.HealthConnection).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('is atomic: a failure part-way through the local deletion leaves the user and all data in place', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    const before = await countOwnedRows(user.id);
    // Make the final statement (the User delete) fail: the transaction must roll everything back.
    const spy = jest.spyOn(prisma.user, 'deleteMany').mockImplementationOnce((() => {
      return prisma.$queryRaw`SELECT 1/0` as never;
    }) as never);

    await expect(deleteUserAccount(user.id, noopDeps())).rejects.toThrow();
    spy.mockRestore();

    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await countOwnedRows(user.id)).toEqual(before);
    await deleteUserAccount(user.id, noopDeps());
  });

  it('is idempotent: deleting an unknown or already-deleted user deletes nothing and does not throw', async () => {
    const user = await newUser();
    const deps = noopDeps();
    await deleteUserAccount(user.id, deps);

    const again = await deleteUserAccount(user.id, deps);
    const unknown = await deleteUserAccount(randomUUID(), deps);

    expect(totalRows(again.counts)).toBe(0);
    expect(totalRows(unknown.counts)).toBe(0);
  });
});

describe('jobs that run after the account is gone', () => {
  const asJob = (name: string, data: unknown) => ({ name, data }) as unknown as Job;
  const jobDate = '2026-09-10';

  async function deletedUserWithHistory(): Promise<string> {
    const user = await newUser();
    await seedHistory(user.id, '2026-08-01', 40);
    await deleteUserAccount(user.id, { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} });
    return user.id;
  }

  it('computeDailyScore returns no-user and writes nothing', async () => {
    const userId = await deletedUserWithHistory();

    expect(await computeDailyScore(userId, jobDate)).toBe('no-user');

    expect(totalRows(await countOwnedRows(userId))).toBe(0);
  });

  it('computeDailyScore treats a foreign-key violation from a mid-job deletion as no-user, not a failure', async () => {
    const user = await newUser();
    await seedHistory(user.id, '2026-08-01', 40);
    const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce((async () => {
      // The account is deleted after the job read the user but before it wrote.
      await deleteUserAccount(user.id, { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} });
      throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
    }) as never);

    expect(await computeDailyScore(user.id, jobDate)).toBe('no-user');
    spy.mockRestore();
    expect(totalRows(await countOwnedRows(user.id))).toBe(0);
  });

  it('computeDailyScore still rethrows a foreign-key violation while the user exists', async () => {
    const user = await newUser();
    await seedHistory(user.id, '2026-08-01', 40);
    const spy = jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' }));

    await expect(computeDailyScore(user.id, jobDate)).rejects.toThrow('Foreign key');
    spy.mockRestore();
    await deleteUserAccount(user.id, { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} });
  });

  it('the queued computeDailyScore, habit-correlation, fetch and backfill jobs all resolve without error or writes', async () => {
    const userId = await deletedUserWithHistory();

    await expect(processSyncJob(asJob('computeDailyScore', { userId, date: jobDate }))).resolves.toBeUndefined();
    await expect(processSyncJob(asJob('runHabitCorrelations', { userId, runKey: '2026-W37' }))).resolves.toBeUndefined();
    await expect(processSyncJob(asJob('fetch', { userId, metricType: 'HRV', date: jobDate }))).resolves.toBeUndefined();
    await expect(
      processSyncJob(asJob('backfill', { userId, startDate: '2026-09-01', endDate: jobDate })),
    ).resolves.toBeUndefined();

    expect(totalRows(await countOwnedRows(userId))).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
  });

  it('runHabitCorrelations for a deleted user does nothing', async () => {
    const userId = await deletedUserWithHistory();

    expect(await runHabitCorrelations(userId, { runKey: '2026-W37' })).toEqual({ skipped: false, tested: expect.any(Number), passed: 0 });

    expect(await prisma.habitCorrelation.count({ where: { userId } })).toBe(0);
  });
});
