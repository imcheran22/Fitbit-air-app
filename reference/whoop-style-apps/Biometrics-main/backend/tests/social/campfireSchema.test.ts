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

it('stores one goodnight per author per evening', async () => {
  const a = await buddyUser();
  const at = new Date('2026-10-08T05:30:00Z');
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at, onTime: true } });
  await expect(prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at, onTime: false } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-08'), at: new Date('2026-10-09T05:30:00Z'), onTime: true } });
  expect(await prisma.goodnight.count({ where: { authorId: a.id } })).toBe(2);
});

it('keeps one camp note per author', async () => {
  const a = await buddyUser();
  const expiresAt = new Date('2026-10-08T13:00:00Z');
  await prisma.campNote.create({ data: { authorId: a.id, text: 'bed soon', expiresAt } });
  await expect(prisma.campNote.create({ data: { authorId: a.id, text: 'again', expiresAt } })).rejects.toMatchObject({ code: 'P2002' });
});

it("deleting the account removes the author's goodnights and camp note", async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:30:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: a.id, text: 'night all', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: b.id, text: 'still here', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.goodnight.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.campNote.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.campNote.count({ where: { authorId: b.id } })).toBe(1);
});
