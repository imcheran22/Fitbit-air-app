import request from 'supertest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken } from '../helpers/auth';
import { testServer } from '../helpers/server';

const MIGRATION = path.join(
  __dirname,
  '../../prisma/migrations/20260928120000_normalize_user_email/migration.sql',
);

// The migration is two statements: the collision-check DO block (whose body
// contains its own semicolons) and the UPDATE. Split after the block's `$$;`.
function migrationStatements(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const end = sql.indexOf('$$;');
  if (end === -1) throw new Error('migration has no DO $$ block');
  const doBlock = sql.slice(sql.indexOf('DO $$'), end + 3);
  const rest = sql.slice(end + 3).trim();
  return [doBlock, rest].filter((s) => s.length > 0);
}

async function runMigration(): Promise<void> {
  for (const statement of migrationStatements()) await prisma.$executeRawUnsafe(statement);
}

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

describe('20260928120000_normalize_user_email', () => {
  it('lower-cases and trims stored emails so a later Google sign-in finds the same user', async () => {
    const id = randomUUID();
    const messy = `  Mixed-${id}@Example.COM `;
    const clean = `mixed-${id}@example.com`;
    const user = await prisma.user.create({ data: { email: messy, name: 'Legacy', emailVerified: true } });
    try {
      await runMigration();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(clean);

      const { app } = createTestApp();
      const token = fakeIdToken({
        iss: 'https://accounts.google.com',
        aud: 'test-google-client-id',
        sub: `g-${id}`,
        email: clean,
        email_verified: true,
      });
      const res = await request(await testServer(app)).post('/auth/sign-in/social').send({ provider: 'google', idToken: { token } });
      expect(res.status).toBe(200);
      const matches = await prisma.user.findMany({ where: { email: { equals: clean, mode: 'insensitive' } } });
      expect(matches.map((u) => u.id)).toEqual([user.id]);
    } finally {
      await prisma.user.deleteMany({ where: { email: { contains: id, mode: 'insensitive' } } });
    }
  });

  it('refuses to run when two users share an email up to case', async () => {
    const id = randomUUID();
    const lower = `dup-${id}@example.com`;
    const upper = `DUP-${id}@Example.com`;
    await prisma.user.createMany({
      data: [
        { email: lower, name: 'A', emailVerified: true },
        { email: upper, name: 'B', emailVerified: true },
      ],
    });
    try {
      await expect(runMigration()).rejects.toThrow(
        new RegExp(`dup-${id}@example\\.com[\\s\\S]*prisma migrate resolve --rolled-back 20260928120000_normalize_user_email`),
      );
      const emails = (await prisma.user.findMany({ where: { email: { contains: id, mode: 'insensitive' } } }))
        .map((u) => u.email)
        .sort();
      expect(emails).toEqual([upper, lower].sort());
    } finally {
      await prisma.user.deleteMany({ where: { email: { contains: id, mode: 'insensitive' } } });
    }
  });
});
