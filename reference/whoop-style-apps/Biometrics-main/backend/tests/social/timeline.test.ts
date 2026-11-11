import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { buildTimeline } from '../../src/social/timeline';
import { saveCheckIn } from '../../src/social/checkins';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // 13:00 in Los Angeles
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000);
const ALLOWED: Record<string, string[]> = {
  checkin: ['actor', 'at', 'id', 'kind', 'locked', 'mine', 'mood'],
  checkin_locked: ['actor', 'at', 'id', 'kind', 'locked', 'mine'],
  step_goal: ['actor', 'at', 'id', 'kind', 'mine'],
  badge: ['actor', 'at', 'badge', 'id', 'kind', 'mine'],
  sticker: ['actor', 'at', 'id', 'kind', 'mine', 'sticker', 'to'],
  recap_share: ['actor', 'at', 'id', 'kind', 'mine', 'recapKind'],
};
const shape = (i: { kind: string; locked?: boolean }) => (i.kind === 'checkin' && i.locked ? 'checkin_locked' : i.kind);

it("lists today's circle events in the viewer's day, gated by sharing, with no numbers", async () => {
  const me = await buddyUser({ timezone: 'America/Los_Angeles' });
  const sam = await buddyUser({ timezone: 'America/Los_Angeles' });
  const ana = await buddyUser({ timezone: 'America/Los_Angeles' });
  const stranger = await buddyUser({ timezone: 'America/Los_Angeles' });
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ana.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareSteps: true, shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });

  await saveCheckIn(me.id, 'RESTED', ago(300));
  await saveCheckIn(sam.id, 'TIRED', ago(240));
  await saveCheckIn(stranger.id, 'RESTED', ago(200));
  await prisma.checkIn.create({ data: { authorId: ana.id, localDate: civilDateToUtcMidnight('2026-10-06'), mood: 'OKAY', createdAt: new Date('2026-10-06T18:00:00Z') } }); // yesterday
  await prisma.stepGoalEvent.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: ago(120) } });
  await prisma.stepGoalEvent.create({ data: { authorId: ana.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: ago(110) } }); // ana doesn't share steps
  await prisma.achievement.create({ data: { userId: ana.id, family: 'STEP_GOAL', level: 1, value: 3, earnedOn: civilDateToUtcMidnight('2026-10-07'), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01'), createdAt: ago(100) } }); // ana doesn't share streaks
  await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: me.id, kind: 'HEART', sentAt: ago(60) } });

  const items = await buildTimeline(me.id, NOW);
  expect(items.map((i) => [i.kind, i.actor.id, i.mine])).toEqual([
    ['checkin', me.id, true],
    ['checkin', sam.id, false],
    ['step_goal', sam.id, false],
    ['sticker', sam.id, false],
  ]);
  for (const item of items) expect(Object.keys(item).sort()).toEqual(ALLOWED[shape(item)]);
  expect(items[1]).toMatchObject({ locked: false, mood: 'TIRED' }); // I checked in today, so moods show
  expect(items[3]).toMatchObject({ sticker: 'HEART', to: { id: me.id } });
});

it("locks a buddy's check-in (no mood) until I check in today; mine is never locked", async () => {
  const me = await buddyUser({ timezone: 'America/Los_Angeles' });
  const sam = await buddyUser({ timezone: 'America/Los_Angeles' });
  await pairUp(me.id, sam.id);
  await saveCheckIn(sam.id, 'TIRED', ago(240));
  const before = await buildTimeline(me.id, NOW);
  expect(before).toEqual([expect.objectContaining({ kind: 'checkin', locked: true, mine: false })]);
  expect(before[0]).not.toHaveProperty('mood');
  expect(Object.keys(before[0]!).sort()).toEqual(ALLOWED.checkin_locked);
  // Yesterday's check-in of mine doesn't count: the lock follows my local today.
  await prisma.checkIn.create({ data: { authorId: me.id, localDate: civilDateToUtcMidnight('2026-10-06'), mood: 'RESTED', createdAt: new Date('2026-10-06T16:00:00Z') } });
  expect((await buildTimeline(me.id, NOW))[0]).toMatchObject({ locked: true });

  await saveCheckIn(me.id, 'RESTED', ago(10));
  const after = await buildTimeline(me.id, NOW);
  expect(after.map((i) => [i.actor.id, i.kind, 'locked' in i ? i.locked : null, 'mood' in i ? i.mood : null])).toEqual([
    [sam.id, 'checkin', false, 'TIRED'],
    [me.id, 'checkin', false, 'RESTED'],
  ]);
});

it("lists an Auckland buddy's check-in in a Los Angeles viewer's day (the viewer's day decides)", async () => {
  const me = await buddyUser({ timezone: 'America/Los_Angeles' });
  const kiwi = await buddyUser({ timezone: 'Pacific/Auckland' });
  await pairUp(me.id, kiwi.id);
  const nzMorning = new Date('2026-10-07T19:00:00Z'); // Oct 8 08:00 in Auckland, Oct 7 12:00 in LA
  await saveCheckIn(kiwi.id, 'OKAY', nzMorning);
  const items = await buildTimeline(me.id, NOW); // NOW = Oct 7 13:00 in LA
  expect(items.map((i) => [i.kind, i.actor.id, i.at])).toEqual([['checkin', kiwi.id, nzMorning.toISOString()]]);
  expect(items[0]).toMatchObject({ locked: true });
  // Past LA midnight it is yesterday's, even though it is still Oct 8 in Auckland.
  expect(await buildTimeline(me.id, new Date('2026-10-08T08:00:00Z'))).toEqual([]); // Oct 8 01:00 in LA
});

it('drops step goals once the author stops sharing steps', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareSteps: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await prisma.stepGoalEvent.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: ago(30) } });
  expect((await buildTimeline(me.id, NOW)).map((i) => i.kind)).toEqual(['step_goal']);
  await prisma.user.update({ where: { id: sam.id }, data: { buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION - 1 } });
  expect(await buildTimeline(me.id, NOW)).toEqual([]);
});

it('shows badges while the author shares streaks, recap shares by kind only, and only stickers I sent or received', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const ana = await buddyUser();
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ana.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await prisma.achievement.create({ data: { userId: sam.id, family: 'STEP_GOAL', level: 2, value: 7, earnedOn: civilDateToUtcMidnight('2026-10-07'), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01'), createdAt: ago(90) } });
  const recap = await prisma.recap.create({
    data: { userId: ana.id, kind: 'WEEK', periodStart: civilDateToUtcMidnight('2026-09-28'), periodEnd: civilDateToUtcMidnight('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE', stats: { avgSleep: 431 } },
  });
  await prisma.recapShare.create({ data: { sharerId: ana.id, recapId: recap.id, line: 'A steadier week', localDate: civilDateToUtcMidnight('2026-10-07'), createdAt: ago(80) } });
  await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: ana.id, kind: 'HEART', sentAt: ago(70) } }); // between two of my buddies
  await prisma.sticker.create({ data: { fromUserId: me.id, toUserId: ana.id, kind: 'HEART', sentAt: ago(60) } });

  const items = await buildTimeline(me.id, NOW);
  expect(items.map((i) => [i.kind, i.actor.id, i.mine])).toEqual([
    ['badge', sam.id, false],
    ['recap_share', ana.id, false],
    ['sticker', me.id, true],
  ]);
  for (const item of items) expect(Object.keys(item).sort()).toEqual(ALLOWED[shape(item)]);
  expect(items[0]).toMatchObject({ badge: { family: 'STEP_GOAL', level: 2 } });
  expect(items[1]).toMatchObject({ recapKind: 'WEEK' });
  expect(items[2]).toMatchObject({ to: { id: ana.id } });
  expect(JSON.stringify(items)).not.toMatch(/steadier|avgSleep/); // not a bare '431': random uuids can contain it

  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  expect((await buildTimeline(me.id, NOW)).map((i) => i.kind)).toEqual(['recap_share', 'sticker']);
});

const badge = (userId: string, family: 'STEP_GOAL' | 'SLEEP_GOAL', level: number, earnedOn: string, createdAt: Date) =>
  prisma.achievement.create({ data: { userId, family, level, value: level * 3, earnedOn: civilDateToUtcMidnight(earnedOn), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01'), createdAt } });

it("lists badges by the stories' rule: no backfilled old runs, one item per multi-level jump, hidden on stale consent", async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await badge(sam.id, 'SLEEP_GOAL', 4, '2026-09-30', ago(20)); // backfill: awarded today for a run that ended a week ago
  await badge(sam.id, 'STEP_GOAL', 2, '2026-10-07', ago(5));
  await badge(sam.id, 'STEP_GOAL', 3, '2026-10-07', ago(5));
  const items = await buildTimeline(me.id, NOW);
  expect(items).toEqual([expect.objectContaining({ kind: 'badge', badge: { family: 'STEP_GOAL', level: 3 } })]);
  await prisma.user.update({ where: { id: sam.id }, data: { buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION - 1 } });
  expect(await buildTimeline(me.id, NOW)).toEqual([]);
});

it('drops a sticker after unpair, keeps the newest under a small limit, and uses an opaque step-goal id', async () => {
  const me = await buddyUser({ timezone: 'America/Los_Angeles' });
  const sam = await buddyUser({ timezone: 'America/Los_Angeles' });
  const ana = await buddyUser({ timezone: 'America/Los_Angeles' });
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ana.id);
  await prisma.user.update({ where: { id: ana.id }, data: { shareSteps: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await saveCheckIn(me.id, 'RESTED', ago(300));
  await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: me.id, kind: 'HEART', sentAt: ago(200) } });
  const goalAt = ago(100);
  await prisma.stepGoalEvent.create({ data: { authorId: ana.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: goalAt } });
  await saveCheckIn(ana.id, 'OKAY', ago(50));

  expect((await buildTimeline(me.id, NOW)).map((i) => i.kind)).toEqual(['checkin', 'sticker', 'step_goal', 'checkin']);
  const newest = await buildTimeline(me.id, NOW, 2);
  expect(newest.map((i) => [i.kind, i.actor.id])).toEqual([['step_goal', ana.id], ['checkin', ana.id]]);
  expect(newest[0]!.id).toBe(`step_goal:${ana.id}:${goalAt.getTime()}`);
  expect(await buildTimeline(me.id, NOW, 0)).toEqual([]);
  expect(await buildTimeline(me.id, NOW, -3)).toEqual([]);

  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: sam.id }, { userBId: sam.id }] } });
  expect((await buildTimeline(me.id, NOW)).map((i) => i.kind)).toEqual(['checkin', 'step_goal', 'checkin']);
});

it('answers not_buddies when the viewer row is missing', async () => {
  await expect(buildTimeline('00000000-0000-4000-8000-000000000000', NOW)).rejects.toMatchObject({ code: 'not_buddies' });
});
