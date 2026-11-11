import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { getStory, loadStoryRings, markStorySeen } from '../../src/social/stories';
import { randomUUID } from 'crypto';
import { saveCheckIn } from '../../src/social/checkins';
import { shareRecap } from '../../src/social/recapShares';
import { api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z');
const day = (d: string) => civilDateToUtcMidnight(d);
const sharesStreaks = { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION };

async function badge(userId: string, at: Date, opts: { level?: number; earnedOn?: string } = {}) {
  return prisma.achievement.create({
    data: { userId, family: 'SLEEP_GOAL', level: opts.level ?? 2, value: 7, earnedOn: day(opts.earnedOn ?? '2026-10-07'), weekStart: day('2026-10-05'), monthStart: day('2026-10-01'), createdAt: at },
  });
}

it("shows a buddy's ring locked until I check in, then their mood; badges only while they share streaks", async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  await saveCheckIn(sam.id, 'TIRED', new Date(NOW.getTime() - 3_600_000));
  await badge(sam.id, new Date(NOW.getTime() - 1_800_000));

  const first = await loadStoryRings(me.id, NOW);
  let { rings } = first;
  expect(rings.map((r) => [r.author.id, r.unseen, r.locked, r.frameCount])).toEqual([[sam.id, true, true, 2]]);
  expect([first.checkedInBuddies, first.viewerCheckedIn, first.checkedInCoachIds]).toEqual([1, false, [rings[0]!.author.coachId]]);
  const locked = await getStory(me.id, sam.id, NOW);
  expect(locked.frames[0]).toEqual({ kind: 'checkin', at: expect.any(String), locked: true });
  expect(locked.frames[1]).toMatchObject({ kind: 'badge', family: 'SLEEP_GOAL', level: 2 });

  await saveCheckIn(me.id, 'RESTED', NOW);
  ({ rings } = await loadStoryRings(me.id, NOW));
  expect(rings[0]!.locked).toBe(false);
  expect((await getStory(me.id, sam.id, NOW)).frames[0]).toEqual({ kind: 'checkin', at: expect.any(String), locked: false, mood: 'TIRED' });

  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  expect((await getStory(me.id, sam.id, NOW)).frames.map((f) => f.kind)).toEqual(['checkin']);
});

it("follows the author's local day across time zones", async () => {
  const me = await buddyUser({ timezone: 'America/Los_Angeles' });
  const kiwi = await buddyUser({ timezone: 'Pacific/Auckland' });
  await pairUp(me.id, kiwi.id);
  const nzMorning = new Date('2026-10-07T19:00:00Z'); // Oct 8 08:00 in Auckland, Oct 7 12:00 in LA
  await saveCheckIn(kiwi.id, 'OKAY', nzMorning);
  expect((await loadStoryRings(me.id, nzMorning)).rings).toHaveLength(1);
  const nzNextDay = new Date('2026-10-08T11:30:00Z'); // Oct 9 00:30 in Auckland
  expect((await loadStoryRings(me.id, nzNextDay)).rings).toHaveLength(0);
});

it('a shared recap frame carries its headline line as previewed, period and coach — never the stats JSON', async () => {
  const me = await buddyUser();
  const ana = await buddyUser();
  await pairUp(me.id, ana.id);
  const recap = await prisma.recap.create({
    data: { userId: ana.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE', stats: { avgSleep: 431 } },
  });
  await prisma.recapShare.create({ data: { sharerId: ana.id, recapId: recap.id, line: 'A steadier week', localDate: day('2026-10-07'), createdAt: NOW } });
  const frame = (await getStory(me.id, ana.id, NOW)).frames.find((f) => f.kind === 'recap');
  expect(Object.keys(frame!).sort()).toEqual(['at', 'coachId', 'kind', 'line', 'periodEnd', 'periodStart', 'recapId', 'recapKind']);
  expect(frame).toMatchObject({ line: 'A steadier week' });
  // The line is consented to at share time; the stats JSON never leaves the recap.
  expect(JSON.stringify(frame)).not.toContain('431');
});

it('seen clears the ring; a non-buddy (or after unpair) is not_buddies', async () => {
  const me = await buddyUser();
  const ben = await buddyUser();
  const stranger = await buddyUser();
  await pairUp(me.id, ben.id);
  await saveCheckIn(ben.id, 'RESTED', NOW);
  await saveCheckIn(stranger.id, 'RESTED', NOW);
  await markStorySeen(me.id, ben.id, NOW);
  expect((await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen)).toEqual([false]);
  await expect(getStory(me.id, stranger.id, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: me.id }, { userBId: me.id }] } });
  expect((await loadStoryRings(me.id, NOW)).rings).toEqual([]);
  const agent = await api();
  const res = await agent.get(`/me/social/stories/${ben.id}`).set(await authHeaderFor(me.id));
  expect([res.status, res.body]).toEqual([403, { error: 'not_buddies' }]);
  expect((await agent.get('/me/social/stories/not-a-uuid').set(await authHeaderFor(me.id))).body).toEqual({ error: 'not_buddies' });
});

it('my own story is readable and never locked', async () => {
  const me = await buddyUser();
  await saveCheckIn(me.id, 'OKAY', NOW);
  expect((await getStory(me.id, me.id, NOW)).frames).toEqual([{ kind: 'checkin', at: expect.any(String), locked: false, mood: 'OKAY' }]);
});

it('a recap frame shows the line as shared, even if the recap line is rewritten later', async () => {
  const me = await buddyUser();
  const ana = await buddyUser();
  await pairUp(me.id, ana.id);
  const recap = await prisma.recap.create({
    data: { userId: ana.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE' },
  });
  await shareRecap(ana.id, recap.id, 'A steadier week', NOW);
  await prisma.recap.update({ where: { id: recap.id }, data: { line: 'You slept 6h 02m a night on average.' } });
  const frames = (await getStory(me.id, ana.id, NOW)).frames;
  expect(frames).toEqual([expect.objectContaining({ kind: 'recap', line: 'A steadier week' })]);
  expect(JSON.stringify(frames)).not.toContain('6h 02m');
});

it('badges: only those earned today or yesterday, and only the top level per family', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  const at = new Date(NOW.getTime() - 3_600_000);
  // Created today (e.g. by a backfill) for a run that ended a week ago: not today's news.
  await badge(sam.id, at, { level: 1, earnedOn: '2026-10-01' });
  expect((await getStory(me.id, sam.id, NOW)).frames).toEqual([]);
  // A jump of several levels at once shows only the top one.
  await badge(sam.id, at, { level: 2, earnedOn: '2026-10-06' });
  await badge(sam.id, at, { level: 3 });
  expect((await getStory(me.id, sam.id, NOW)).frames).toEqual([{ kind: 'badge', at: at.toISOString(), family: 'SLEEP_GOAL', level: 3 }]);
  expect((await loadStoryRings(me.id, NOW)).rings.map((r) => r.frameCount)).toEqual([1]);
});

it('no badge while the streak switch is on but consent is stale', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION - 1 } });
  await badge(sam.id, new Date(NOW.getTime() - 3_600_000));
  expect((await getStory(me.id, sam.id, NOW)).frames).toEqual([]);
  expect((await loadStoryRings(me.id, NOW)).rings).toEqual([]);
});

it("excludes the author's yesterday recap share and badge", async () => {
  const me = await buddyUser();
  const ana = await buddyUser();
  await pairUp(me.id, ana.id);
  await prisma.user.update({ where: { id: ana.id }, data: sharesStreaks });
  const yesterday = new Date('2026-10-06T20:00:00Z');
  const recap = await prisma.recap.create({
    data: { userId: ana.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE' },
  });
  await shareRecap(ana.id, recap.id, 'A steadier week', yesterday);
  await badge(ana.id, yesterday, { earnedOn: '2026-10-06' });
  expect((await getStory(me.id, ana.id, yesterday)).frames.map((f) => f.kind).sort()).toEqual(['badge', 'recap']);
  expect((await getStory(me.id, ana.id, NOW)).frames).toEqual([]);
  expect((await loadStoryRings(me.id, NOW)).rings).toEqual([]);
});

it('orders rings unseen first, then newest', async () => {
  const me = await buddyUser();
  const a = await buddyUser();
  const b = await buddyUser();
  const c = await buddyUser();
  for (const u of [a, b, c]) await pairUp(me.id, u.id);
  await saveCheckIn(a.id, 'OKAY', new Date(NOW.getTime() - 3 * 3_600_000));
  await saveCheckIn(b.id, 'OKAY', new Date(NOW.getTime() - 2 * 3_600_000));
  await saveCheckIn(c.id, 'OKAY', new Date(NOW.getTime() - 3_600_000));
  await markStorySeen(me.id, c.id, NOW);
  const { rings, checkedInBuddies, checkedInCoachIds } = await loadStoryRings(me.id, NOW);
  expect(rings.map((r) => [r.author.id, r.unseen])).toEqual([[b.id, true], [a.id, true], [c.id, false]]);
  expect([checkedInBuddies, checkedInCoachIds.length]).toEqual([3, 2]);
});

it('a valid uuid with no user and a missing viewer are not_buddies; seen route is 204 and GET is no-store', async () => {
  const me = await buddyUser();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  await saveCheckIn(ben.id, 'RESTED', NOW);
  await expect(getStory(me.id, randomUUID(), NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  await expect(loadStoryRings(randomUUID(), NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const missing = await agent.get(`/me/social/stories/${randomUUID()}`).set(headers);
  expect([missing.status, missing.body]).toEqual([403, { error: 'not_buddies' }]);
  const story = await agent.get(`/me/social/stories/${ben.id}`).set(headers);
  expect([story.status, story.headers['cache-control']]).toEqual([200, 'private, no-store']);
  const seen = await agent.post(`/me/social/stories/${ben.id}/seen`).set(headers);
  expect(seen.status).toBe(204);
  expect(await prisma.storySeen.count({ where: { viewerId: me.id, authorId: ben.id } })).toBe(1);
  const strangerSeen = await agent.post(`/me/social/stories/${randomUUID()}/seen`).set(headers);
  expect([strangerSeen.status, strangerSeen.body]).toEqual([403, { error: 'not_buddies' }]);
});

it('a later frame lights a seen ring again: seen means the newest frame reached, not the whole day (S2 deferral)', async () => {
  const me = await buddyUser();
  const sam = await buddyUser(); // UTC: NOW is 20:00 on 2026-10-07 for Sam
  await pairUp(me.id, sam.id);
  const checkInAt = new Date(NOW.getTime() - 4 * 3_600_000); // 16:00
  await saveCheckIn(sam.id, 'RESTED', checkInAt);
  await markStorySeen(me.id, sam.id, new Date(NOW.getTime() - 3 * 3_600_000), checkInAt.toISOString());
  const ring = async () => (await loadStoryRings(me.id, NOW)).rings.map((r) => [r.unseen, r.frameCount]);
  expect(await ring()).toEqual([[false, 1]]);
  // An evening goodnight after I watched: a new frame, so the ring lights again.
  const goodnightAt = new Date(NOW.getTime() - 3_600_000); // 19:00
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: goodnightAt, onTime: true } });
  expect(await ring()).toEqual([[true, 2]]);
  // Watching through the goodnight clears it; an older "through" (a second viewer racing) never moves it back.
  await markStorySeen(me.id, sam.id, NOW, goodnightAt.toISOString());
  await markStorySeen(me.id, sam.id, NOW, checkInAt.toISOString());
  expect(await ring()).toEqual([[false, 2]]);
  const row = await prisma.storySeen.findUniqueOrThrow({ where: { viewerId_authorId_localDate: { viewerId: me.id, authorId: sam.id, localDate: day('2026-10-07') } } });
  expect(row.lastFrameAt?.toISOString()).toBe(goodnightAt.toISOString());
});

it('an app that sends no "through" (S1/S2) is seen up to now; a future or unreadable one is clamped to now', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await saveCheckIn(sam.id, 'RESTED', new Date(NOW.getTime() - 3_600_000));
  await markStorySeen(me.id, sam.id, NOW);
  expect((await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen)).toEqual([false]);
  for (const through of ['2099-01-01T00:00:00.000Z', 'not a date', 42, null]) {
    await prisma.storySeen.deleteMany({ where: { viewerId: me.id } });
    await markStorySeen(me.id, sam.id, NOW, through);
    const row = await prisma.storySeen.findFirstOrThrow({ where: { viewerId: me.id } });
    expect([through, row.lastFrameAt?.toISOString()]).toEqual([through, NOW.toISOString()]);
  }
});

it('a seen row from before S3 (no lastFrameAt) counts up to its seenAt, so a later frame still lights the ring', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await saveCheckIn(sam.id, 'RESTED', new Date(NOW.getTime() - 4 * 3_600_000));
  await prisma.storySeen.create({ data: { viewerId: me.id, authorId: sam.id, localDate: day('2026-10-07'), seenAt: new Date(NOW.getTime() - 3 * 3_600_000) } });
  const unseen = async () => (await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen);
  expect(await unseen()).toEqual([false]);
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: new Date(NOW.getTime() - 3_600_000), onTime: false } });
  expect(await unseen()).toEqual([true]);
  await markStorySeen(me.id, sam.id, NOW); // an S2 app, no through
  expect(await unseen()).toEqual([false]);
});

it('the seen route takes { through } and answers 204', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  const at = new Date(Date.now() - 60_000);
  await saveCheckIn(sam.id, 'RESTED', at);
  const res = await (await api()).post(`/me/social/stories/${sam.id}/seen`).set(await authHeaderFor(me.id)).send({ through: at.toISOString() });
  expect(res.status).toBe(204);
  const row = await prisma.storySeen.findFirstOrThrow({ where: { viewerId: me.id, authorId: sam.id } });
  expect(row.lastFrameAt?.toISOString()).toBe(at.toISOString());
});

// Final review M9 (T1): two open viewers racing (the first seen of the day for both) leave one row at the later frame.
it('two seen calls at once leave one row, at the later frame', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  const early = new Date(NOW.getTime() - 4 * 3_600_000);
  const late = new Date(NOW.getTime() - 3_600_000);
  await saveCheckIn(sam.id, 'RESTED', early);
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: late, onTime: true } });
  await Promise.all([markStorySeen(me.id, sam.id, NOW, early.toISOString()), markStorySeen(me.id, sam.id, NOW, late.toISOString())]);
  const rows = await prisma.storySeen.findMany({ where: { viewerId: me.id, authorId: sam.id } });
  expect(rows.map((r) => r.lastFrameAt?.toISOString())).toEqual([late.toISOString()]);
  expect((await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen)).toEqual([false]);
});

// T1: a ring that a later frame lights again sorts with the unseen ones, ahead of a seen ring.
it('a re-lit ring sorts with the unseen rings, newest first', async () => {
  const me = await buddyUser();
  const a = await buddyUser();
  const b = await buddyUser();
  for (const u of [a, b]) await pairUp(me.id, u.id);
  const checkInAt = new Date(NOW.getTime() - 5 * 3_600_000);
  await saveCheckIn(a.id, 'OKAY', checkInAt);
  await saveCheckIn(b.id, 'OKAY', new Date(NOW.getTime() - 2 * 3_600_000));
  await markStorySeen(me.id, a.id, NOW, checkInAt.toISOString());
  await markStorySeen(me.id, b.id, NOW);
  const order = async () => (await loadStoryRings(me.id, NOW)).rings.map((r) => [r.author.id, r.unseen]);
  expect(await order()).toEqual([[b.id, false], [a.id, false]]);
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at: new Date(NOW.getTime() - 3_600_000), onTime: true } });
  expect(await order()).toEqual([[a.id, true], [b.id, false]]);
});
