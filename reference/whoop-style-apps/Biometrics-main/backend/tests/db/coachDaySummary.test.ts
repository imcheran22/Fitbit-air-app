import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20260930140000_coach_day_summary';
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

  it('is additive only: no DROP, and every ALTER TABLE only adds', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).not.toMatch(/\bDROP\b/i);
    const alters = sql.split('\n').filter((line) => line.startsWith('ALTER TABLE'));
    expect(alters.length).toBeGreaterThan(0);
    for (const line of alters) expect(line).toMatch(/^ALTER TABLE "\w+" ADD (COLUMN|CONSTRAINT) /);
  });

  it('keeps one summary per user per day', async () => {
    const user = await createUser();
    const date = civilDateToUtcMidnight('2026-09-30');
    const row = await prisma.coachDaySummary.create({
      data: { userId: user.id, date, text: 'Recovery 26.', spans: [{ text: 'Recovery 26.', metric: 'recovery' }], source: 'TEMPLATE' },
    });
    expect(row.source).toBe('TEMPLATE');
    await expect(
      prisma.coachDaySummary.create({ data: { userId: user.id, date, text: 'again', spans: [], source: 'AI' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('links a memory to the message that proposed it, and keeps the memory when the message is deleted', async () => {
    const user = await createUser();
    const conversation = await prisma.coachConversation.create({ data: { userId: user.id } });
    const message = await prisma.coachMessage.create({
      data: { conversationId: conversation.id, userId: user.id, role: 'ASSISTANT', text: 'Noted.' },
    });
    const memory = await prisma.coachMemory.create({
      data: { userId: user.id, category: 'SCHEDULE', value: 'Runs at 6am', messageId: message.id },
    });
    const legacy = await prisma.coachMemory.create({ data: { userId: user.id, category: 'PREFERENCE', value: 'Short answers' } });
    expect(legacy.messageId).toBeNull();

    await prisma.coachMessage.delete({ where: { id: message.id } });

    expect((await prisma.coachMemory.findUniqueOrThrow({ where: { id: memory.id } })).messageId).toBeNull();
  });
});
