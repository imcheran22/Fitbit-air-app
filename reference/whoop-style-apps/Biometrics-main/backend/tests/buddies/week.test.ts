import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { blockBuddy } from '../../src/buddies/relations';
import { buildBuddyWeek } from '../../src/buddies/view';
import { seedNight } from '../recap/helpers';
import { api, buddyUser, pairUp } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-10T12:00:00Z');
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A buddy with a week of distinctive values: recovery 47.4 (fair → ok), sleep score 77.2, 510 min (over the 480 goal), 12345 steps. */
async function buddyWithWeek(share: Partial<Record<'shareRecovery' | 'shareSleepScore' | 'shareHoursSlept' | 'shareSteps' | 'shareStreaks', boolean>> = {}, consent: number | null = BUDDY_SHARING_CONSENT_VERSION) {
  const viewer = await buddyUser();
  const buddy = await buddyUser({ displayName: 'Sam' });
  await pairUp(viewer.id, buddy.id);
  await prisma.user.update({ where: { id: buddy.id }, data: { ...share, buddySharingConsentVersion: consent, achievementsSince: civilDateToUtcMidnight('2026-10-01') } });
  for (const date of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    await seedNight(buddy.id, date, { minutes: 510, sleepScore: 77.2, recovery: 47.4, steps: 12345 });
  }
  await prisma.achievement.create({
    data: { userId: buddy.id, family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: civilDateToUtcMidnight('2026-10-07'), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01') },
  });
  return { viewer, buddy };
}

/** The DTO as JSON without ids, handles (hex) and dates, so any digit left would be a health value. */
const scrubbed = (dto: unknown) =>
  JSON.stringify(dto).replace(UUID_G, 'ID').replace(/"handle":"[^"]*"/g, '"handle":"H"').replace(/\d{4}-\d{2}-\d{2}/g, 'DATE');
const VALUES = /47|77|8\.5|510|12345|12,345/;

it('mood only: tiles without fallback, the mood line, and no number anywhere', async () => {
  const { viewer, buddy } = await buddyWithWeek();
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect(week.buddy).toMatchObject({ id: buddy.id, displayName: 'Sam', handle: buddy.handle });
  // Today (10th) has no score: the mood falls back to yesterday; the tile for today does not.
  expect(week.mood).toBe('ok');
  expect(week.moodLine).toBe('Doing okay');
  expect(week.tiles).toEqual([
    { date: '2026-10-04', mood: 'ok' }, { date: '2026-10-05', mood: 'ok' }, { date: '2026-10-06', mood: 'ok' }, { date: '2026-10-07', mood: 'ok' },
    { date: '2026-10-08', mood: 'ok' }, { date: '2026-10-09', mood: 'ok' }, { date: '2026-10-10', mood: 'none' },
  ]);
  expect(week.shares).toEqual([]);
  expect(week.numbers).toEqual({});
  expect(week.badges).toBeUndefined();
  expect(scrubbed(week)).not.toMatch(VALUES);
  expect(scrubbed(week)).not.toMatch(/\d/);
});

it.each([
  ['shareRecovery', 'recovery', 47],
  ['shareSleepScore', 'sleepScore', 77],
  ['shareHoursSlept', 'hoursSlept', 8.5],
  ['shareSteps', 'steps', 12345],
] as const)('%s on adds exactly its own row of 7 days, and nothing else carries a value', async (column, key, value) => {
  const { viewer, buddy } = await buddyWithWeek({ [column]: true });
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect(Object.keys(week.numbers)).toEqual([key]);
  expect(week.numbers[key]).toHaveLength(7);
  expect(week.numbers[key]![0]).toEqual({ date: '2026-10-04', value });
  expect(week.numbers[key]![6]).toEqual({ date: '2026-10-10', value: null });
  expect(week.shares).toEqual([key]);
  expect(week.moodLine).toBe(key === 'steps' ? 'Doing okay · moved a lot yesterday' : 'Doing okay');
  // Outside its own row the DTO holds no health value at all.
  expect(scrubbed({ ...week, numbers: {} })).not.toMatch(/\d/);
});

it('streaks on: the streak clause (≥ 3 nights) and badge levels, only on the week', async () => {
  const { viewer, buddy } = await buddyWithWeek({ shareStreaks: true });
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect(week.moodLine).toBe('Doing okay · on a 6-night streak');
  expect(week.badges).toEqual([{ family: 'SLEEP_GOAL', level: 2 }]);
  expect(week.shares).toEqual(['streaks']);
});

it('reads no sleep sessions, and badge levels in one grouped query', async () => {
  const { viewer, buddy } = await buddyWithWeek({ shareStreaks: true });
  await prisma.achievement.create({
    data: { userId: buddy.id, family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: civilDateToUtcMidnight('2026-10-03'), weekStart: civilDateToUtcMidnight('2026-09-28'), monthStart: civilDateToUtcMidnight('2026-10-01') },
  });
  const sessions = jest.spyOn(prisma.sleepSession, 'findMany');
  const rows = jest.spyOn(prisma.achievement, 'findMany');
  const grouped = jest.spyOn(prisma.achievement, 'groupBy');
  try {
    const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
    expect(week.badges).toEqual([{ family: 'SLEEP_GOAL', level: 2 }]);
    expect(sessions).not.toHaveBeenCalled();
    expect(rows).not.toHaveBeenCalled();
    expect(grouped).toHaveBeenCalledTimes(1);
  } finally {
    jest.restoreAllMocks();
  }
});

it('a stale consent version reads every switch as off', async () => {
  const { viewer, buddy } = await buddyWithWeek(
    { shareRecovery: true, shareSleepScore: true, shareHoursSlept: true, shareSteps: true, shareStreaks: true },
    BUDDY_SHARING_CONSENT_VERSION - 1,
  );
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect([week.shares, week.numbers, week.badges, week.moodLine]).toEqual([[], {}, undefined, 'Doing okay']);
});

it("mood uses the buddy's local today (Auckland is already on the 11th at 12:00Z)", async () => {
  const viewer = await buddyUser();
  const buddy = await buddyUser({ timezone: 'Pacific/Auckland' });
  await pairUp(viewer.id, buddy.id);
  await seedNight(buddy.id, '2026-10-11', { minutes: 400, recovery: 20 });
  await seedNight(buddy.id, '2026-10-10', { minutes: 400, recovery: 90 });
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect(week.mood).toBe('low');
  expect(week.tiles.at(-1)).toEqual({ date: '2026-10-11', mood: 'low' });
});

it('a buddy with no data: none, and shared rows empty', async () => {
  const viewer = await buddyUser();
  const buddy = await buddyUser();
  await pairUp(viewer.id, buddy.id);
  await prisma.user.update({ where: { id: buddy.id }, data: { shareSteps: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  const week = await buildBuddyWeek(viewer.id, buddy.id, NOW);
  expect([week.mood, week.moodLine]).toEqual(['none', 'No data yet']);
  expect(week.numbers.steps!.every((d) => d.value === null)).toBe(true);
});

describe('GET /me/buddies/:buddyId', () => {
  it('answers the week, reports mute, and marks their stickers to me as seen', async () => {
    const viewer = await buddyUser();
    const buddy = await buddyUser();
    await pairUp(viewer.id, buddy.id);
    await prisma.buddyMute.create({ data: { muterId: viewer.id, mutedId: buddy.id } });
    const sticker = await prisma.sticker.create({ data: { fromUserId: buddy.id, toUserId: viewer.id, kind: 'STAR' } });
    const res = await (await api()).get(`/me/buddies/${buddy.id}`).set(await authHeaderFor(viewer.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ buddy: { id: buddy.id }, muted: true });
    expect((await prisma.sticker.findUniqueOrThrow({ where: { id: sticker.id } })).seenAt).not.toBeNull();
  });

  it('malformed and non-buddy ids answer 403 not_buddies, never a bare 404', async () => {
    const viewer = await buddyUser();
    const stranger = await buddyUser();
    for (const id of [stranger.id, 'not-a-uuid', viewer.id]) {
      const res = await (await api()).get(`/me/buddies/${id}`).set(await authHeaderFor(viewer.id));
      expect([id, res.status, res.body]).toEqual([id, 403, { error: 'not_buddies' }]);
    }
  });

  it('a blocked ex-buddy (either direction) answers exactly like a stranger', async () => {
    const viewer = await buddyUser();
    const blockedByMe = await buddyUser();
    const blockedMe = await buddyUser();
    const stranger = await buddyUser();
    await pairUp(viewer.id, blockedByMe.id);
    await pairUp(viewer.id, blockedMe.id);
    await blockBuddy(viewer.id, blockedByMe.id, new Date());
    await blockBuddy(blockedMe.id, viewer.id, new Date());
    const answers: unknown[] = [];
    for (const other of [blockedByMe, blockedMe, stranger]) {
      const res = await (await api()).get(`/me/buddies/${other.id}`).set(await authHeaderFor(viewer.id));
      answers.push([res.status, res.body]);
    }
    expect(answers).toEqual([[403, { error: 'not_buddies' }], [403, { error: 'not_buddies' }], [403, { error: 'not_buddies' }]]);
  });
});
