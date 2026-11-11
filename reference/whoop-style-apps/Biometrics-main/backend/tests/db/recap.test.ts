import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const day = (d: string) => new Date(`${d}T00:00:00Z`);

it('stores a built recap with its stats and goal snapshot, one per user, kind and period', async () => {
  const user = await createUser();
  const row = await prisma.recap.create({
    data: {
      userId: user.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT',
      stats: { nightsWithData: 6 }, sleepGoalMinutes: 480, line: 'A steady week.', lineSource: 'TEMPLATE', personaId: 'mochi',
    },
  });
  expect(row).toMatchObject({ openedAt: null, rebuiltAt: null, pushedAt: null, story: null, storySource: null });
  await expect(
    prisma.recap.create({
      data: { userId: user.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'SKIPPED', sleepGoalMinutes: 480 },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
  // The same period start as a MONTH is a different recap.
  await prisma.recap.create({
    data: { userId: user.id, kind: 'MONTH', periodStart: day('2026-09-28'), periodEnd: day('2026-10-27'), status: 'SKIPPED', sleepGoalMinutes: 480 },
  });
});

it('turns recap pushes on by default', async () => {
  const user = await createUser();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { recapPushEnabled: true } });
  expect(row.recapPushEnabled).toBe(true);
});
