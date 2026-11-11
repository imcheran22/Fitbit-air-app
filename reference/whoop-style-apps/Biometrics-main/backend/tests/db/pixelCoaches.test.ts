import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20261001130000_pixel_coaches';
const SQL = readFileSync(path.join(__dirname, `../../prisma/migrations/${NAME}/migration.sql`), 'utf8');
// Strip comments before splitting: the migration's comments contain semicolons.
const UPDATE = SQL.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).find((s) => s.startsWith('UPDATE'))!;

async function userWith(id: string | null) {
  const u = await createUser();
  if (id !== null) await prisma.user.update({ where: { id: u.id }, data: { coachPersonaId: id } });
  return u.id;
}

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

describe(NAME, () => {
  it('clears every retired character and leaves Mochi, null and unknown rows alone', async () => {
    const retired = await Promise.all(['hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat'].map(userWith));
    const kept = { mochi: await userWith('mochi'), none: await userWith(null) };
    await prisma.$executeRawUnsafe(UPDATE);
    const rows = await prisma.user.findMany({ where: { id: { in: [...retired, kept.mochi, kept.none] } }, select: { id: true, coachPersonaId: true } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.coachPersonaId]));
    for (const id of retired) expect(byId[id]).toBeNull();
    expect(byId[kept.mochi]).toBe('mochi');
    expect(byId[kept.none]).toBeNull();
  });

  it('adds nullable thinking columns that default to null', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: await userWith(null) }, select: { coachThinkingAttachment: true, coachThinkingText: true } });
    expect(u).toEqual({ coachThinkingAttachment: null, coachThinkingText: null });
  });
});
