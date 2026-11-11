import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

const NAME = '20260930120000_coach_answer_pipeline';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

async function conversationFor(userId: string) {
  return prisma.coachConversation.create({ data: { userId } });
}

describe(NAME, () => {
  it('is applied by prisma migrate deploy', async () => {
    const rows = await prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${NAME}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  it('adds nullable card, engine and durationMs columns to CoachMessage', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string; udt_name: string }>>`
      SELECT column_name, is_nullable, udt_name FROM information_schema.columns
      WHERE table_name = 'CoachMessage' AND column_name IN ('card', 'engine', 'durationMs') ORDER BY column_name`;
    expect(cols).toEqual([
      { column_name: 'card', is_nullable: 'YES', udt_name: 'jsonb' },
      { column_name: 'durationMs', is_nullable: 'YES', udt_name: 'int4' },
      { column_name: 'engine', is_nullable: 'YES', udt_name: 'CoachEngine' },
    ]);
  });

  it('creates the CoachEngine enum with LOCAL and HOSTED', async () => {
    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'CoachEngine' ORDER BY e.enumsortorder`;
    expect(labels.map((l) => l.enumlabel)).toEqual(['LOCAL', 'HOSTED']);
  });

  it('stores a card, the engine and the duration, and leaves them null when not given', async () => {
    const user = await createUser();
    const conv = await conversationFor(user.id);
    const card = { headline: 'Recovery is low', tiles: [{ factId: 'recovery.today', label: 'Recovery', display: '26', value: 26 }], source: 'Today' };
    const withCard = await prisma.coachMessage.create({
      data: { conversationId: conv.id, userId: user.id, role: 'ASSISTANT', text: 'Hi.', source: 'MODEL', card, engine: 'LOCAL', durationMs: 8123 },
    });
    const plain = await prisma.coachMessage.create({
      data: { conversationId: conv.id, userId: user.id, role: 'USER', text: 'hello' },
    });
    const [a, b] = await Promise.all([
      prisma.coachMessage.findUniqueOrThrow({ where: { id: withCard.id } }),
      prisma.coachMessage.findUniqueOrThrow({ where: { id: plain.id } }),
    ]);
    expect(a).toMatchObject({ card, engine: 'LOCAL', durationMs: 8123 });
    expect(b).toMatchObject({ card: null, engine: null, durationMs: null });
  });
});
