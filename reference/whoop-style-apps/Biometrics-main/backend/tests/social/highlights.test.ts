import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { getWeeklyHighlights, highlightsReadyAt } from '../../src/social/highlights';
import { api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // Wednesday; last completed week = Mon 2026-09-28 .. Sun 2026-10-04
const WEEK = '2026-09-28';
const day = (offset: number, week = WEEK) => civilDateToUtcMidnight(shiftDate(week, offset));
const noon = (offset: number) => new Date(day(offset).getTime() + 12 * 3_600_000);
const sharesStreaks = { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION };

async function circle() {
  const me = await buddyUser();
  const ana = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  const ben = await buddyUser({ displayName: 'Ben' });
  for (const b of [ana, sam, ben]) await pairUp(me.id, b.id);
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  for (let i = 0; i < 7; i++) await prisma.checkIn.create({ data: { authorId: ana.id, localDate: day(i), mood: 'RESTED' } });
  await prisma.achievement.create({ data: { userId: sam.id, family: 'STEP_GOAL', level: 3, value: 14, earnedOn: day(3), weekStart: day(0), monthStart: civilDateToUtcMidnight('2026-09-01') } });
  // Ben: Tired Mon, Tired Tue, Rested Wed — consecutive days, so a comeback.
  await prisma.checkIn.create({ data: { authorId: ben.id, localDate: day(0), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: ben.id, localDate: day(1), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: ben.id, localDate: day(2), mood: 'RESTED' } });
  // My own stickers: 3 sent (most_stickers_sent), 2 received from Ana (most_cheered_you).
  for (let i = 0; i < 3; i++) await prisma.sticker.create({ data: { fromUserId: me.id, toUserId: ana.id, kind: 'CHEER', sentAt: noon(i) } });
  for (let i = 0; i < 2; i++) await prisma.sticker.create({ data: { fromUserId: ana.id, toUserId: me.id, kind: 'HEART', sentAt: noon(i) } });
  // Between two of my buddies: never counted, however many.
  for (let i = 0; i < 5; i++) await prisma.sticker.create({ data: { fromUserId: ana.id, toUserId: sam.id, kind: 'STAR', sentAt: noon(i) } });
  return { me, ana, sam, ben };
}

it("builds last week's highlights for my circle, gated at read time and cached", async () => {
  const { me, ana, sam, ben } = await circle();
  const first = await getWeeklyHighlights(me.id, NOW);
  expect(first).toMatchObject({ weekStart: '2026-09-28', weekEnd: '2026-10-04' });
  expect(first!.items.map((i) => [i.type, i.actor.id])).toEqual([
    ['top_story', sam.id],
    ['most_cheered_you', ana.id],
    ['comeback', ben.id],
    ['checked_in_every_day', ana.id],
    ['most_stickers_sent', me.id],
  ]);
  expect(first!.items[0]).toMatchObject({ reason: 'badge', family: 'STEP_GOAL', level: 3 });
  expect(first!.items[1]).toMatchObject({ count: 2 });
  expect(first!.items[4]).toMatchObject({ count: 3, mine: true });

  // Gating runs again on every read: Sam's badge hides (the next top-story candidate, Ana every day, takes its
  // place and is not repeated below), and Ben, no longer a buddy, drops out.
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: ben.id }, { userBId: ben.id }] } });
  const second = await getWeeklyHighlights(me.id, NOW);
  expect(second!.items.map((i) => [i.type, i.actor.id])).toEqual([
    ['top_story', ana.id],
    ['most_cheered_you', ana.id],
    ['most_stickers_sent', me.id],
  ]);
  expect(second!.items[0]).toMatchObject({ reason: 'checked_in_every_day' });
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(1);
});

it('a cache row purged between its write and the re-read is no highlights for that read, never a throw', async () => {
  const { me } = await circle();
  const createMany = prisma.weeklyHighlights.createMany.bind(prisma.weeklyHighlights);
  // An account-deletion purge (purgeSocialJsonMentions) lands right after the write.
  const spy = jest.spyOn(prisma.weeklyHighlights, 'createMany').mockImplementation((async (args: Parameters<typeof createMany>[0]) => {
    const result = await createMany(args);
    await prisma.weeklyHighlights.deleteMany({ where: { viewerId: me.id } });
    return result;
  }) as never);
  try {
    expect(await getWeeklyHighlights(me.id, NOW)).toBeNull();
  } finally {
    spy.mockRestore();
  }
  // The next read rebuilds.
  expect((await getWeeklyHighlights(me.id, NOW))!.items.length).toBeGreaterThan(0);
});

it('a buddy who turns streaks on after the build appears on the next read', async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  await prisma.achievement.create({ data: { userId: sam.id, family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: day(4), weekStart: day(0), monthStart: civilDateToUtcMidnight('2026-09-01') } });
  // The badge is stored as an ungated candidate, so the cached row exists while nothing is visible yet.
  expect(await getWeeklyHighlights(me.id, NOW)).toBeNull();
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(1);
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  const later = await getWeeklyHighlights(me.id, NOW);
  expect(later!.items.map((i) => [i.type, i.actor.id])).toEqual([['top_story', sam.id]]);
});

it('a comeback needs consecutive days, and a week with nothing is cached empty for an hour', async () => {
  const me = await buddyUser();
  const zed = await buddyUser({ displayName: 'Zed' });
  await pairUp(me.id, zed.id);
  // Tired Mon, Tired Tue, nothing Wed, Rested Thu: not a comeback.
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(0), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(1), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(3), mood: 'RESTED' } });
  expect(await getWeeklyHighlights(me.id, NOW)).toBeNull();
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(1);
  // Rebuilt once the empty row is an hour old: a row that completes the run now counts.
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(2), mood: 'TIRED' } });
  expect((await getWeeklyHighlights(me.id, new Date(NOW.getTime() + 60 * 60 * 1000)))!.items.map((i) => i.type)).toEqual(['comeback']);
});

it('waits until Monday 14:00 UTC: an Auckland Monday-morning read serves the week before', async () => {
  expect(highlightsReadyAt('2026-09-28').toISOString()).toBe('2026-10-05T14:00:00.000Z');
  const me = await buddyUser({ timezone: 'Pacific/Auckland' });
  const ana = await buddyUser({ displayName: 'Ana' });
  await pairUp(me.id, ana.id);
  for (let i = 0; i < 7; i++) {
    await prisma.checkIn.create({ data: { authorId: ana.id, localDate: day(i, '2026-09-21'), mood: 'RESTED' } });
    await prisma.checkIn.create({ data: { authorId: ana.id, localDate: day(i, '2026-09-28'), mood: 'OKAY' } });
  }
  const aucklandMonday = new Date('2026-10-04T18:00:00Z'); // Mon Oct 5 07:00 in Auckland; Sunday still runs in the Americas
  expect(await getWeeklyHighlights(me.id, aucklandMonday)).toMatchObject({ weekStart: '2026-09-21', weekEnd: '2026-09-27' });
  const mondayAfternoon = new Date('2026-10-05T14:00:00Z');
  expect(await getWeeklyHighlights(me.id, mondayAfternoon)).toMatchObject({ weekStart: '2026-09-28', weekEnd: '2026-10-04' });
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(2);
});

it('returns null for a quiet week, and the route is never cached', async () => {
  const me = await buddyUser();
  expect(await getWeeklyHighlights(me.id, NOW)).toBeNull();
  const res = await (await api()).get('/me/social/highlights').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'private, no-store']);
  expect(res.body).toEqual({ highlights: null });
});
