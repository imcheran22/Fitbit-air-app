import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { RECAP_SWEEP_JOB } from '../../src/recap/queue';
import { runRecapSweep } from '../../src/recap/sweep';
import { processSyncJob } from '../../src/sync/worker';
import { deleteUserAccount } from '../../src/users/deletion';
import { getWeeklyHighlights } from '../../src/social/highlights';
import { HIGHLIGHTS_RETENTION_WEEKS, runSocialSweep } from '../../src/social/sweep';
import { buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');
// The recap sweep itself is not under test here: it would queue recap builds for every test user.
jest.mock('../../src/recap/sweep', () => ({ ...jest.requireActual('../../src/recap/sweep'), runRecapSweep: jest.fn().mockResolvedValue({}) }));

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

// The suites share one database, so the sweep never runs on the real clock here: a far-past clock with far-past
// fixtures reaches only this file's rows (other suites' notes expire, and their weeks start, in 2026).
const SWEEP_NOW = new Date('2025-02-10T12:00:00Z'); // cutoff = 2025-02-10 − 28 days = 2025-01-13
const OLD_WEEK = '2025-01-06'; // before the cutoff: deleted
const KEPT_WEEK = '2025-01-13'; // the cutoff itself: kept
// For the read-time gate below (not a sweep): the week 2026-09-28 is final at this moment.
const READ_NOW = new Date('2026-10-07T20:00:00Z');
const day = (d: string) => civilDateToUtcMidnight(d);
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const weeksOf = async (viewerId: string) =>
  (await prisma.weeklyHighlights.findMany({ where: { viewerId }, select: { weekStart: true } })).map((r) => r.weekStart.toISOString().slice(0, 10)).sort();

it('deletes expired camp notes and highlight caches older than 4 weeks, and keeps the rest', async () => {
  expect(HIGHLIGHTS_RETENTION_WEEKS).toBe(4);
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.campNote.create({ data: { authorId: a.id, text: 'gone', expiresAt: new Date('2025-02-10T06:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: b.id, text: 'live', expiresAt: new Date('2025-02-11T06:00:00Z') } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(OLD_WEEK), items: [] } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(KEPT_WEEK), items: [] } });
  const result = await runSocialSweep(SWEEP_NOW);
  // Assert on this file's own rows; the counts include at least them.
  expect(result.notes).toBeGreaterThanOrEqual(1);
  expect(result.highlights).toBeGreaterThanOrEqual(1);
  expect(await prisma.campNote.findMany({ where: { authorId: { in: [a.id, b.id] } }, select: { text: true } })).toEqual([{ text: 'live' }]);
  expect(await weeksOf(a.id)).toEqual([KEPT_WEEK]);
});

it('the hourly recap-sweep tick runs the social sweep too, on the clock the job pins, logging counts only', async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.campNote.create({ data: { authorId: a.id, text: 'private words', expiresAt: new Date('2025-02-10T06:00:00Z') } });
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'private chats words', createdAt: new Date('2025-02-09T06:00:00Z'), expiresAt: new Date('2025-02-10T06:00:00Z') } });
  await prisma.report.create({ data: { reporterId: b.id, reportedUserId: a.id, targetType: 'STATUS_NOTE', targetId: a.id, reason: 'SPAM', excerpt: 'reported words', createdAt: new Date('2024-11-01T00:00:00Z') } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(OLD_WEEK), items: [] } });
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  await processSyncJob({ name: RECAP_SWEEP_JOB, data: { now: SWEEP_NOW.toISOString() } } as unknown as Job);
  expect(runRecapSweep).toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: a.id } })).toBe(0);
  expect(await weeksOf(a.id)).toEqual([]);
  expect(await prisma.statusNote.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.report.count({ where: { reportedUserId: a.id } })).toBe(0);
  const lines = info.mock.calls.map((c) => String(c[0]));
  const sweep = lines.find((l) => l.includes('"event":"social.sweep"'));
  expect(Object.keys(JSON.parse(sweep!)).sort()).toEqual(['event', 'highlights', 'notes', 'reports', 'statusNotes']);
  expect(lines.join('\n')).not.toMatch(/private words|private chats words|reported words/);
});

it("deleting an account deletes the highlight caches that name it; a cached id that isn't a buddy never surfaces", async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  const c = await buddyUser();
  await pairUp(a.id, b.id);
  await pairUp(b.id, c.id);
  await prisma.weeklyHighlights.create({ data: { viewerId: b.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: a.id }] } });
  await prisma.weeklyHighlights.create({ data: { viewerId: c.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: b.id }] } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: b.id } })).toBe(0);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: c.id } })).toBe(1);
  // A cache written before the purge existed, naming someone who is nobody's buddy now.
  await prisma.weeklyHighlights.create({
    data: { viewerId: b.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: randomUUID() }, { type: 'checked_in_every_day', actorId: c.id }] },
  });
  expect((await getWeeklyHighlights(b.id, READ_NOW))!.items.map((i) => i.actor.id)).toEqual([c.id]);
});
