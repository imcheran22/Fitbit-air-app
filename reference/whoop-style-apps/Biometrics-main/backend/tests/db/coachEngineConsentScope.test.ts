// backend/tests/db/coachEngineConsentScope.test.ts
import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20260930130000_coach_engine_consent_scope';
const MIGRATION = path.join(__dirname, `../../prisma/migrations/${NAME}/migration.sql`);

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

describe(NAME, () => {
  it('is applied by prisma migrate deploy', async () => {
    const rows = await prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${NAME}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  it('is additive only: no DROP, no RENAME, no data rewrite', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it('defaults a new user to the local engine', async () => {
    const user = await createUser();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { coachEngine: true } });
    expect(row.coachEngine).toBe('LOCAL');
  });

  it('defaults a consent row to the local scope and accepts HOSTED', async () => {
    const user = await createUser();
    const local = await prisma.coachConsent.create({ data: { userId: user.id, version: '2' } });
    const hosted = await prisma.coachConsent.create({ data: { userId: user.id, version: 'hosted-1', scope: 'HOSTED' } });
    expect(local.scope).toBe('LOCAL');
    expect(hosted.scope).toBe('HOSTED');
  });
});
