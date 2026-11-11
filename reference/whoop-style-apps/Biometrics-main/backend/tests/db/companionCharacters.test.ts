import { readFileSync } from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { PERSONA_SETS } from '../../src/coach/personas';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20260929120000_companion_characters';
const MIGRATION = path.join(__dirname, `../../prisma/migrations/${NAME}/migration.sql`);

// Three plain UPDATEs: drop the comment lines, then split on the semicolons.
function migrationStatements(): string[] {
  return readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runMigration(): Promise<void> {
  for (const statement of migrationStatements()) await prisma.$executeRawUnsafe(statement);
}

async function userWith(coachPersonaId: string | null) {
  const user = await createUser();
  if (coachPersonaId !== null) await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId } });
  return user.id;
}

const storedIds = async (ids: string[]) =>
  (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, coachPersonaId: true } })).reduce<
    Record<string, string | null>
  >((acc, u) => ({ ...acc, [u.id]: u.coachPersonaId }), {});

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

describe(NAME, () => {
  it('is applied by prisma migrate deploy', async () => {
    const rows = await prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${NAME}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  it('is three data-only UPDATEs on "User"', () => {
    const statements = migrationStatements();
    expect(statements).toHaveLength(3);
    for (const s of statements) expect(s).toMatch(/^UPDATE "User" SET "coachPersonaId" = '[a-z]+' WHERE "coachPersonaId" = '[a-z]+'$/);
  });

  it('moves each legacy style to its character and leaves everything else alone', async () => {
    const ids = {
      encouraging: await userWith('encouraging'),
      direct: await userWith('direct'),
      clinical: await userWith('clinical'),
      never: await userWith(null),
      mochi: await userWith('mochi'),
      hoot: await userWith('hoot'),
      unknown: await userWith('retired-persona'),
      cased: await userWith('Encouraging'),
    };

    await runMigration();

    expect(await storedIds(Object.values(ids))).toEqual({
      [ids.encouraging]: 'pip',
      [ids.direct]: 'hoot',
      [ids.clinical]: 'beep',
      [ids.never]: null, // still unchosen, so the picker shows once
      [ids.mochi]: 'mochi',
      [ids.hoot]: 'hoot',
      [ids.unknown]: 'retired-persona', // resolvePersona serves the default for it at read time
      [ids.cased]: 'Encouraging', // exact match only, as the PUT route never stored another spelling
    });
  });

  it('is idempotent: a second run changes nothing', async () => {
    const ids = [await userWith('encouraging'), await userWith('direct'), await userWith('clinical'), await userWith(null)];
    await runMigration();
    const once = await storedIds(ids);
    await runMigration();
    expect(await storedIds(ids)).toEqual(once);
    expect(Object.values(once)).toEqual(expect.arrayContaining(['pip', 'hoot', 'beep', null]));
  });

  // Historical: the ids it writes were live characters in v3, the set live when it shipped. v4 retired them
  // (the 20261001130000 migration clears them), so this checks against v3, not the live set.
  it('only ever writes ids that were live characters when it shipped (v3)', () => {
    const written = migrationStatements().map((s) => /SET "coachPersonaId" = '([a-z]+)'/.exec(s)![1]!);
    expect(written).toEqual(['pip', 'hoot', 'beep']);
    const v3Ids = PERSONA_SETS.v3!.personas.map((p) => p.id);
    for (const id of written) expect(v3Ids).toContain(id);
  });

  it('leaves the persona recorded on past recaps untouched', async () => {
    const userId = await userWith('encouraging');
    await prisma.coachDigest.create({
      data: { userId, text: 'recap', personaId: 'encouraging', weekStart: new Date('2026-09-14T00:00:00Z') },
    });
    await runMigration();
    expect((await prisma.coachDigest.findFirstOrThrow({ where: { userId } })).personaId).toBe('encouraging');
  });
});
