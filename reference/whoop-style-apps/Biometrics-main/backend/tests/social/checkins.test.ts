import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { checkInStreak, getTodayCheckIn, saveCheckIn } from '../../src/social/checkins';
import { api, buddyUser } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

it("saves today's check-in in the author's zone and edits it the same local day", async () => {
  const u = await buddyUser({ timezone: 'America/Los_Angeles' });
  const morning = new Date('2026-10-07T15:00:00Z'); // 08:00 LA, Oct 7
  expect(await saveCheckIn(u.id, 'TIRED', morning)).toMatchObject({ mood: 'TIRED', localDate: '2026-10-07' });
  const evening = new Date('2026-10-08T05:30:00Z'); // 22:30 LA, still Oct 7
  expect(await saveCheckIn(u.id, 'RESTED', evening)).toMatchObject({ mood: 'RESTED', localDate: '2026-10-07' });
  expect(await prisma.checkIn.count({ where: { authorId: u.id } })).toBe(1);
  const nextDay = new Date('2026-10-08T08:00:00Z'); // 01:00 LA, Oct 8
  expect(await getTodayCheckIn(u.id, nextDay)).toBeNull();
  expect(await saveCheckIn(u.id, 'OKAY', nextDay)).toMatchObject({ localDate: '2026-10-08' });
  expect(await prisma.checkIn.count({ where: { authorId: u.id } })).toBe(2);
});

it('rejects anything but the three moods', async () => {
  const u = await buddyUser();
  for (const bad of ['GOOD', 'rested', 1, null, undefined]) {
    await expect(saveCheckIn(u.id, bad, new Date())).rejects.toMatchObject({ code: 'invalid_checkin' });
  }
});

it('routes: GET returns null then the saved check-in, never cached', async () => {
  const u = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(u.id);
  const empty = await agent.get('/me/social/checkin').set(headers);
  expect([empty.status, empty.body, empty.headers['cache-control']]).toEqual([200, { checkIn: null }, 'private, no-store']);
  const put = await agent.put('/me/social/checkin').set(headers).send({ mood: 'OKAY' });
  expect([put.status, put.body.checkIn.mood]).toEqual([200, 'OKAY']);
  expect((await agent.put('/me/social/checkin').set(headers).send({ mood: 'NOPE' })).body).toEqual({ error: 'invalid_checkin' });
  expect((await agent.get('/me/social/checkin').set(headers)).body.checkIn.mood).toBe('OKAY');
  expect((await agent.get('/me/social/checkin')).status).toBe(401);
});

describe('checkInStreak', () => {
  const checkIn = (authorId: string, date: string) =>
    prisma.checkIn.create({ data: { authorId, localDate: civilDateToUtcMidnight(date), mood: 'OKAY' } });

  it('counts consecutive local days ending today', async () => {
    const u = await buddyUser({ timezone: 'Europe/London' });
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) await checkIn(u.id, d);
    expect(await checkInStreak(u.id, new Date('2026-10-08T09:00:00Z'))).toBe(4);
  });

  it("keeps yesterday's run alive while today has no check-in yet", async () => {
    const u = await buddyUser({ timezone: 'Europe/London' });
    for (const d of ['2026-10-06', '2026-10-07']) await checkIn(u.id, d);
    expect(await checkInStreak(u.id, new Date('2026-10-08T09:00:00Z'))).toBe(2);
  });

  it('is 0 after a missed day, and counts only the run after a gap', async () => {
    const u = await buddyUser({ timezone: 'Europe/London' });
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05']) await checkIn(u.id, d);
    expect(await checkInStreak(u.id, new Date('2026-10-05T09:00:00Z'))).toBe(2);
    expect(await checkInStreak(u.id, new Date('2026-10-07T09:00:00Z'))).toBe(0);
  });

  it("reads today in the user's zone", async () => {
    const u = await buddyUser({ timezone: 'America/Los_Angeles' });
    for (const d of ['2026-10-06', '2026-10-07']) await checkIn(u.id, d);
    // 03:00 UTC on Oct 8 is still Oct 7 in Los Angeles: today is checked in.
    expect(await checkInStreak(u.id, new Date('2026-10-08T03:00:00Z'))).toBe(2);
    // Oct 9 in Los Angeles: Oct 8 was missed.
    expect(await checkInStreak(u.id, new Date('2026-10-09T18:00:00Z'))).toBe(0);
  });

  it("never counts another user's check-ins", async () => {
    const u = await buddyUser({ timezone: 'Europe/London' });
    const other = await buddyUser({ timezone: 'Europe/London' });
    await checkIn(other.id, '2026-10-08');
    await checkIn(u.id, '2026-10-07');
    expect(await checkInStreak(u.id, new Date('2026-10-08T09:00:00Z'))).toBe(1);
    expect(await checkInStreak(other.id, new Date('2026-10-08T09:00:00Z'))).toBe(1);
  });
});
