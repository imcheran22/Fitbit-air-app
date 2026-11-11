// Counts every Prisma model operation through a query extension on the shared client. The factory only touches
// `mockQueries` when a query runs, after this file's top level has set it.
const mockQueries = { count: 0 };
jest.mock('../../src/db/client', () => {
  const { PrismaClient } = jest.requireActual('@prisma/client');
  const base = new PrismaClient();
  return {
    prisma: base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
            mockQueries.count += 1;
            return query(args);
          },
        },
      },
    }),
  };
});

import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import * as circle from '../../src/social/circle';
import * as checkins from '../../src/social/checkins';
import { getWeeklyHighlights } from '../../src/social/highlights';
import { getSocialHome } from '../../src/social/home';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  jest.restoreAllMocks();
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // Wednesday; last week Mon 2026-09-28 is final
const WEEK = '2026-09-28';
// Not tests/buddies/helpers: it loads the app and Better Auth, which should not run on the counting client.
const person = (name: string) =>
  prisma.user.create({
    data: { email: `q-${randomUUID()}@example.com`, name, handle: `q${randomUUID().replace(/-/g, '').slice(0, 12)}`, displayName: name, buddyMoodNoticeAt: new Date() },
  });
const pair = (a: string, b: string, createdAt = new Date()) =>
  prisma.buddyPair.create({ data: { ...(a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }), createdAt } });

it('builds the whole home from one preloaded circle, in at most 17 queries, with one lock decision', async () => {
  const me = await person('Me');
  const sam = await person('Sam');
  const ana = await person('Ana');
  await pair(me.id, sam.id);
  await pair(me.id, ana.id);
  for (let i = 0; i < 7; i++) {
    await prisma.checkIn.create({ data: { authorId: ana.id, localDate: civilDateToUtcMidnight(shiftDate(WEEK, i)), mood: 'RESTED' } });
  }
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), mood: 'TIRED', createdAt: new Date('2026-10-07T15:00:00Z') } });
  await getSocialHome(me.id, NOW); // the first read builds and caches last week's highlights

  const loads = jest.spyOn(circle, 'loadCircle');
  const rederived = [
    jest.spyOn(circle, 'buddyIdsOf'),
    jest.spyOn(circle, 'membersById'),
    jest.spyOn(checkins, 'todayFor'),
    jest.spyOn(checkins, 'getTodayCheckIn'),
  ];
  mockQueries.count = 0;
  const home = await getSocialHome(me.id, NOW);

  // S1 measured 27. Now: loadCircle 4 + rings 3 + timeline 6 (camp notes since S2) + cached highlights 1 + requests 2 + stickers 1 = 17.
  // S3's unread chats is one raw query ($queryRaw), which this model-level counter does not see: it adds nothing here.
  expect(mockQueries.count).toBeLessThanOrEqual(17);
  expect(loads).toHaveBeenCalledTimes(1);
  for (const spy of rederived) expect(spy).not.toHaveBeenCalled();
  // One lock decision everywhere: I haven't checked in, so Sam's ring and Sam's timeline check-in are both locked.
  expect(home.me.checkIn).toBeNull();
  expect(home.stories.map((r) => r.locked)).toEqual([true]);
  expect(home.timeline.map((i) => ('locked' in i ? i.locked : null))).toEqual([true]);
  expect(home.highlights).not.toBeNull();
});

it('the circle carries when each buddy paired with me, and my own bedtime goal only', async () => {
  const me = await person('Me');
  const sam = await person('Sam');
  await prisma.user.update({ where: { id: me.id }, data: { bedtimeGoal: '22:30' } });
  await prisma.user.update({ where: { id: sam.id }, data: { bedtimeGoal: '21:00' } });
  const pairedAt = new Date('2026-10-05T12:00:00Z');
  await pair(me.id, sam.id, pairedAt);
  const c = await circle.loadCircle(me.id, NOW);
  expect([...c.pairedAt]).toEqual([[sam.id, pairedAt]]);
  expect(c.viewerBedtimeGoal).toBe('22:30');
  expect(JSON.stringify(c.buddies)).not.toContain('21:00'); // a buddy's goal is never kept
});

const HOUR = 60 * 60 * 1000;
const later = (ms: number) => new Date(NOW.getTime() + ms);

it('a quiet week is cached empty for an hour, so a read within it costs five queries, and rebuilt after', async () => {
  const quiet = await person('Quiet');
  expect(await getWeeklyHighlights(quiet.id, NOW)).toBeNull();
  const cached = () => prisma.weeklyHighlights.findMany({ where: { viewerId: quiet.id }, select: { weekStart: true, items: true, builtAt: true } });
  expect((await cached()).map((r) => [r.weekStart.toISOString().slice(0, 10), r.items, r.builtAt])).toEqual([[WEEK, [], NOW]]);
  mockQueries.count = 0;
  expect(await getWeeklyHighlights(quiet.id, later(HOUR - 1))).toBeNull();
  // loadCircle 4 + the cached row 1: no rebuild.
  expect(mockQueries.count).toBe(5);
  // An hour on, the empty row is rebuilt and, still empty, stored again with the new build time.
  expect(await getWeeklyHighlights(quiet.id, later(HOUR))).toBeNull();
  expect((await cached()).map((r) => [r.items, r.builtAt])).toEqual([[[], later(HOUR)]]);
});

it('a badge evaluated after a quiet week was cached, back-dated into that week, shows once the empty row expires', async () => {
  const me = await person('Me');
  const sam = await person('Sam');
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await pair(me.id, sam.id);
  expect(await getWeeklyHighlights(me.id, NOW)).toBeNull(); // cached empty
  // Sam opens Achievements later: the badge is inserted now with earnedOn inside the cached week.
  await prisma.achievement.create({
    data: { userId: sam.id, family: 'STEP_GOAL', level: 2, value: 7, earnedOn: civilDateToUtcMidnight(shiftDate(WEEK, 3)), weekStart: civilDateToUtcMidnight(WEEK), monthStart: civilDateToUtcMidnight('2026-09-01') },
  });
  expect(await getWeeklyHighlights(me.id, later(HOUR - 1))).toBeNull(); // the empty row is still fresh
  const shown = await getWeeklyHighlights(me.id, later(HOUR + 1));
  expect(shown!.items.map((i) => [i.type, i.actor.id])).toEqual([['top_story', sam.id]]);
  expect(shown!.items[0]).toMatchObject({ reason: 'badge', family: 'STEP_GOAL', level: 2 });
  // Now non-empty, the row is frozen: a later streaks switch-off gates it at read time, the row stays.
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  expect(await getWeeklyHighlights(me.id, later(3 * HOUR))).toBeNull();
  const rows = await prisma.weeklyHighlights.findMany({ where: { viewerId: me.id }, select: { builtAt: true } });
  expect(rows.map((r) => r.builtAt)).toEqual([later(HOUR + 1)]);
});
