import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('prisma client', () => {
  it('can create and read back a user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: 'Test User'},
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe(email);
  });
});
