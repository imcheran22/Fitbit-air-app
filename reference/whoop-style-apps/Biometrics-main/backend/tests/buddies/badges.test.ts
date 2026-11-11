import type { Job } from 'bullmq';
import { prisma } from '../../src/db/client';
import { connection, syncQueue } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { evaluateAchievements } from '../../src/achievements/evaluate';
import { ALL_FAMILIES } from '../../src/achievements/catalogue';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { BUDDY_BADGE_JOB, announceBuddyBadges, highestNewPerFamily, runBuddyBadgeJob } from '../../src/buddies/badges';
import { processSyncJob } from '../../src/sync/worker';
import { setPushSender } from '../../src/coach/config';
import { seedNights } from '../recap/helpers';
import { lockPairSlot, orderedPair } from '../../src/buddies/pairs';
import { unpair } from '../../src/buddies/relations';
import { RecordingSender, addToken, api, buddyUser, pairUp } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let quiet: jest.SpyInstance;
beforeEach(() => {
  quiet = jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => quiet.mockRestore());

const NOW = new Date('2026-10-10T12:00:00Z');
const sharing = { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION };

async function earner(share = true) {
  const user = await buddyUser({ displayName: 'Sam' });
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: civilDateToUtcMidnight('2026-10-01'), ...(share ? sharing : {}) } });
  return user;
}

it('keeps only the highest new level of each family', () => {
  const rows = [
    { id: 'a', family: 'SLEEP_GOAL' as const, level: 1 }, { id: 'b', family: 'SLEEP_GOAL' as const, level: 3 },
    { id: 'c', family: 'SLEEP_GOAL' as const, level: 2 }, { id: 'd', family: 'STEP_GOAL' as const, level: 1 },
  ];
  expect(highestNewPerFamily(rows).map((r) => r.id).sort()).toEqual(['b', 'd']);
});

it('a multi-level jump announces the top level only; a concurrent evaluation announces nothing more', async () => {
  const user = await earner();
  await seedNights(user.id, '2026-10-01', [500, 500, 500, 500, 500, 500, 500, 400]);
  const announced: Array<{ family: string; level: number }> = [];
  const announce = async (_userId: string, rows: Array<{ family: string; level: number }>) => void announced.push(...rows);
  await Promise.all([
    evaluateAchievements(user.id, NOW, ALL_FAMILIES, { announce }),
    evaluateAchievements(user.id, NOW, ALL_FAMILIES, { announce }),
  ]);
  expect(announced.map((r) => [r.family, r.level])).toEqual([['SLEEP_GOAL', 2]]);
});

it('enqueues one deduped job per announcement while sharing, nothing when not sharing', async () => {
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const sharer = await earner();
  const quietOne = await earner(false);
  const row = { id: '6a1f9f1e-0000-4000-8000-000000000001', family: 'SLEEP_GOAL' as const, level: 2 };
  await announceBuddyBadges(quietOne.id, [row], { queue });
  expect(queue.add).not.toHaveBeenCalled();
  await announceBuddyBadges(sharer.id, [row], { queue });
  expect(queue.add).toHaveBeenCalledWith(BUDDY_BADGE_JOB, { earnerId: sharer.id, achievementId: row.id }, expect.objectContaining({ jobId: `buddyBadge-${row.id}` }));
});

it('an enqueue failure loses the announcement but keeps the badge, and logs ids only', async () => {
  const user = await earner();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((l: unknown) => void lines.push(String(l)));
  const failing = { add: jest.fn().mockRejectedValue(new Error('redis down')) };
  await expect(
    evaluateAchievements(user.id, NOW, ALL_FAMILIES, { announce: (id, rows) => announceBuddyBadges(id, rows, { queue: failing }) }),
  ).resolves.not.toBeNull();
  spy.mockRestore();
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(1);
  expect(JSON.parse(lines[0]!)).toEqual({ event: 'buddies.badge_enqueue_failed', userId: user.id, achievementId: expect.any(String), error: 'Error' });
});

it('enqueues every family at once under one overall bound, and logs each one that did not make it (ids only)', async () => {
  const user = await earner();
  const rows = (['SLEEP_GOAL', 'STEP_GOAL', 'CHECK_IN'] as const).map((family, i) => ({ id: `6a1f9f1e-0000-4000-8000-00000000001${i}`, family, level: 1 }));
  const queue = { add: jest.fn(() => new Promise(() => {})) };
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((l: unknown) => void lines.push(String(l)));
  const started = Date.now();
  await announceBuddyBadges(user.id, rows, { queue: queue as never, timeoutMs: 200 });
  const elapsed = Date.now() - started;
  spy.mockRestore();
  // One bound for all three, not one each in turn (that would be 600 ms).
  expect(elapsed).toBeLessThan(400);
  expect(queue.add).toHaveBeenCalledTimes(3);
  expect(lines.map((l) => JSON.parse(l)).sort((a, b) => a.achievementId.localeCompare(b.achievementId))).toEqual(
    rows.map((r) => ({ event: 'buddies.badge_enqueue_failed', userId: user.id, achievementId: r.id, error: 'TimeoutError' })),
  );
});

it('a hanging queue.add never hangs GET /me/achievements; the badge is still stored', async () => {
  const user = await earner();
  const today = new Date().toISOString().slice(0, 10);
  await prisma.user.update({ where: { id: user.id }, data: { timezone: 'UTC', achievementsSince: civilDateToUtcMidnight(shiftDate(today, -10)) } });
  await seedNights(user.id, shiftDate(today, -4), [500, 500, 500]);
  const add = jest.spyOn(syncQueue, 'add').mockImplementation((() => new Promise(() => {})) as never);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const started = Date.now();
  const res = await (await api()).get('/me/achievements').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(add).toHaveBeenCalled();
  expect(errors.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('buddies.badge_enqueue_failed');
  expect(await prisma.achievement.count({ where: { userId: user.id, family: 'SLEEP_GOAL' } })).toBeGreaterThan(0);
  add.mockRestore();
  errors.mockRestore();
});

describe('runBuddyBadgeJob', () => {
  async function setup() {
    const sam = await earner();
    const ana = await buddyUser();
    const ben = await buddyUser();
    await pairUp(sam.id, ana.id);
    await pairUp(sam.id, ben.id);
    await addToken(ana.id);
    await addToken(ben.id);
    await prisma.buddyMute.create({ data: { muterId: ben.id, mutedId: sam.id } });
    const ach = await prisma.achievement.create({
      data: { userId: sam.id, family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: civilDateToUtcMidnight('2026-10-07'), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01') },
    });
    return { sam, ana, ben, ach };
  }

  it('writes one Activity row per buddy and pushes where the row is new and the buddy has not muted', async () => {
    const { sam, ana, ben, ach } = await setup();
    const sender = new RecordingSender();
    expect(await runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: sender, now: NOW })).toBe(2);
    expect(await prisma.buddyActivity.count({ where: { actorId: sam.id, kind: 'BUDDY_BADGE', refId: ach.id, recipientId: { in: [ana.id, ben.id] } } })).toBe(2);
    expect(sender.calls.map((c) => [c.targets.length, c.payload.title, c.payload.data])).toEqual([[1, 'Sam reached Sleep goal streak II', { kind: 'buddy_badge', refId: sam.id }]]);
    // A retry dedupes: no new rows, no new pushes.
    expect(await runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: sender, now: NOW })).toBe(0);
    expect(sender.calls).toHaveLength(1);
  });

  it('re-reads sharing inside the write: switched off after the job started, it writes and pushes nothing', async () => {
    const { sam, ach } = await setup();
    const sender = new RecordingSender();
    // The job's first read saw sharing on; the switch goes off before its transaction.
    const original = prisma.achievement.findFirst.bind(prisma.achievement);
    jest.spyOn(prisma.achievement, 'findFirst').mockImplementationOnce((async (args: never) => {
      await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
      return original(args);
    }) as never);
    try {
      expect(await runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: sender, now: NOW })).toBe(0);
    } finally {
      jest.restoreAllMocks();
    }
    expect(await prisma.buddyActivity.count({ where: { actorId: sam.id } })).toBe(0);
    expect(sender.calls).toEqual([]);
  });

  it('does nothing once the earner stops sharing', async () => {
    const { sam, ach } = await setup();
    await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
    const sender = new RecordingSender();
    expect(await runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: sender, now: NOW })).toBe(0);
    expect(await prisma.buddyActivity.count({ where: { actorId: sam.id } })).toBe(0);
  });

  it('is dispatched by the sync worker', async () => {
    const { sam, ach } = await setup();
    setPushSender(new RecordingSender());
    await processSyncJob({ name: BUDDY_BADGE_JOB, data: { earnerId: sam.id, achievementId: ach.id } } as unknown as Job);
    setPushSender(null);
    expect(await prisma.buddyActivity.count({ where: { actorId: sam.id, kind: 'BUDDY_BADGE' } })).toBe(2);
  });

  it('writes and pushes only to a live buddy: never to an ex-buddy or a buddy blocked either way', async () => {
    const { sam, ana, ben, ach } = await setup();
    const exBuddy = await buddyUser();
    const blocker = await buddyUser();
    const blocked = await buddyUser();
    for (const u of [exBuddy, blocker, blocked]) {
      await pairUp(sam.id, u.id);
      await addToken(u.id);
    }
    await unpair(sam.id, exBuddy.id, NOW);
    // A pair next to a block can't arise through the app (block removes the pair); the job excludes it anyway.
    await prisma.buddyBlock.create({ data: { blockerId: blocker.id, blockedId: sam.id } });
    await prisma.buddyBlock.create({ data: { blockerId: sam.id, blockedId: blocked.id } });
    await prisma.buddyMute.deleteMany({ where: { muterId: ben.id } });
    const sender = new RecordingSender();
    expect(await runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: sender, now: NOW })).toBe(2);
    const rows = await prisma.buddyActivity.findMany({ where: { actorId: sam.id, kind: 'BUDDY_BADGE' }, select: { recipientId: true } });
    expect(rows.map((r) => r.recipientId).sort()).toEqual([ana.id, ben.id].sort());
    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: [ana.id, ben.id] } }, select: { token: true } });
    expect(sender.calls.flatMap((c) => c.targets.map((t) => t.token)).sort()).toEqual(tokens.map((t) => t.token).sort());
  });

  it('an unpair in flight (under the pair lock) when the job runs leaves no row for the ex-buddy', async () => {
    const { sam, ana, ben, ach } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inside!: () => void;
    const started = new Promise<void>((resolve) => (inside = resolve));
    let unpairPid = 0;
    // unpair's writes, done but not yet committed, while the job runs.
    const unpairing = prisma.$transaction(async (tx) => {
      unpairPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
      await lockPairSlot(tx, sam.id, ana.id);
      await tx.buddyPair.deleteMany({ where: orderedPair(sam.id, ana.id) });
      await tx.buddyActivity.deleteMany({ where: { OR: [{ recipientId: sam.id, actorId: ana.id }, { recipientId: ana.id, actorId: sam.id }] } });
      inside();
      await gate;
    }, { timeout: 10_000 });
    await started;
    let done = false;
    const job = runBuddyBadgeJob({ earnerId: sam.id, achievementId: ach.id }, { pushSender: new RecordingSender(), now: NOW }).finally(() => {
      done = true;
    });
    // Let the job run until it finishes or waits on the unpair's locks (only waits that unpair's
    // backend blocks count, never some other session's), then commit the unpair.
    for (let i = 0; i < 40 && !done; i++) {
      const [lock] = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
        SELECT count(*) AS waiting FROM pg_locks l WHERE NOT l.granted AND ${unpairPid}::int = ANY(pg_blocking_pids(l.pid))`;
      if (lock && lock.waiting > 0n) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    release();
    await unpairing;
    expect(await job).toBe(1);
    const rows = await prisma.buddyActivity.findMany({ where: { actorId: sam.id, kind: 'BUDDY_BADGE' }, select: { recipientId: true } });
    expect(rows.map((r) => r.recipientId)).toEqual([ben.id]);
  });
});
