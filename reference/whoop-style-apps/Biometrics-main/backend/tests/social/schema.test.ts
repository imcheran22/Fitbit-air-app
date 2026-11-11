import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { deleteUserAccount } from '../../src/users/deletion';
import { buddyUser } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const day = (d: string) => civilDateToUtcMidnight(d);
// The same no-op Google deps as tests/buddies/deletion.test.ts.
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

it('stores one check-in per author per local day', async () => {
  const a = await buddyUser();
  await prisma.checkIn.create({ data: { authorId: a.id, localDate: day('2026-10-07'), mood: 'RESTED' } });
  await expect(prisma.checkIn.create({ data: { authorId: a.id, localDate: day('2026-10-07'), mood: 'TIRED' } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.checkIn.create({ data: { authorId: a.id, localDate: day('2026-10-08'), mood: 'OKAY' } });
  expect(await prisma.checkIn.count({ where: { authorId: a.id } })).toBe(2);
});

it('removes every social row when either user deletes their account (deleteUserAccount, as in production)', async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  // Recap.userId is ON DELETE RESTRICT: deleteUserAccount purges Recap first, and RecapShare cascades from Recap.
  const recap = await prisma.recap.create({
    data: { userId: a.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE' },
  });
  await prisma.checkIn.create({ data: { authorId: a.id, localDate: day('2026-10-07'), mood: 'RESTED' } });
  await prisma.storySeen.create({ data: { viewerId: b.id, authorId: a.id, localDate: day('2026-10-07') } });
  await prisma.recapShare.create({ data: { sharerId: a.id, recapId: recap.id, localDate: day('2026-10-07') } });
  await prisma.stepGoalEvent.create({ data: { authorId: a.id, localDate: day('2026-10-07') } });
  await prisma.weeklyHighlights.create({ data: { viewerId: b.id, weekStart: day('2026-09-28'), items: [] } });

  await deleteUserAccount(a.id, noop);
  expect(await prisma.user.findUnique({ where: { id: a.id } })).toBeNull();
  expect(await prisma.checkIn.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.storySeen.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.recapShare.count({ where: { sharerId: a.id } })).toBe(0);
  expect(await prisma.stepGoalEvent.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: b.id } })).toBe(1);
  await deleteUserAccount(b.id, noop);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: b.id } })).toBe(0);
});
