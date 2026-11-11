import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { USER_OWNED_MODELS, deleteUserAccount } from '../../src/users/deletion';
import { deleteUserCoachData } from '../../src/coach/retention';
import { SET_NULL_COLUMNS, SOCIAL_MODELS, SOCIAL_USER_COLUMNS, type SocialModel } from '../../src/buddies/models';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const newUser = () => prisma.user.create({ data: { email: `buddy-del-${randomUUID()}@example.com`, name: 'Test User' } });

/** Rows in every social table that involve `a` and `b`, in both roles where a table has two. */
async function seedSocial(a: string, b: string) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const pair = await prisma.buddyPair.create({ data: { userAId: lo, userBId: hi } });
  await prisma.buddyRequest.create({ data: { fromUserId: a, toUserId: b, status: 'ACCEPTED' } });
  await prisma.buddyRequest.create({ data: { fromUserId: b, toUserId: a, status: 'CANCELLED' } });
  const later = new Date(Date.now() + 86_400_000);
  const aCode = await prisma.buddyCode.create({ data: { code: randomUUID().slice(0, 8).toUpperCase(), ownerId: a, expiresAt: later, usedAt: new Date(), usedById: b } });
  const bCode = await prisma.buddyCode.create({ data: { code: randomUUID().slice(0, 8).toUpperCase(), ownerId: b, expiresAt: later, usedAt: new Date(), usedById: a } });
  await prisma.buddyBlock.create({ data: { blockerId: a, blockedId: b } });
  await prisma.buddyMute.create({ data: { muterId: b, mutedId: a } });
  const s1 = await prisma.sticker.create({ data: { fromUserId: a, toUserId: b, kind: 'CHEER' } });
  await prisma.sticker.create({ data: { fromUserId: b, toUserId: a, kind: 'STAR' } });
  await prisma.buddyActivity.create({ data: { recipientId: b, actorId: a, kind: 'STICKER', refId: s1.id } });
  await prisma.buddyActivity.create({ data: { recipientId: a, actorId: b, kind: 'PAIRED', refId: pair.id } });
  await prisma.handleHold.create({ data: { handleHash: randomUUID(), previousOwnerId: a, releasedAt: new Date() } });
  // Social tab S1 tables (spec 2026-10-07 social). Each user owns a recap so both sharer roles are covered.
  const today = new Date('2026-10-07T00:00:00Z');
  const week = new Date('2026-09-28T00:00:00Z');
  for (const [me, other] of [[a, b], [b, a]] as const) {
    const recap = await prisma.recap.create({
      data: { userId: me, kind: 'WEEK', periodStart: week, periodEnd: new Date('2026-10-04T00:00:00Z'), status: 'BUILT', sleepGoalMinutes: 480, line: 'A steadier week', lineSource: 'TEMPLATE' },
    });
    await prisma.checkIn.create({ data: { authorId: me, localDate: today, mood: 'RESTED' } });
    await prisma.storySeen.create({ data: { viewerId: me, authorId: other, localDate: today } });
    await prisma.recapShare.create({ data: { sharerId: me, recapId: recap.id, localDate: today } });
    await prisma.stepGoalEvent.create({ data: { authorId: me, localDate: today } });
    await prisma.weeklyHighlights.create({ data: { viewerId: me, weekStart: week, items: [] } });
    // Social S2 tables (Campfire).
    await prisma.goodnight.create({ data: { authorId: me, localDate: today, at: new Date('2026-10-07T22:00:00Z'), onTime: true } });
    await prisma.campNote.create({ data: { authorId: me, text: 'bed soon', expiresAt: new Date('2026-10-08T06:00:00Z') } });
  }
  // Social S3 tables (Chats).
  const conversation = await prisma.conversation.create({ data: { userAId: lo, userBId: hi } });
  for (const [me, other] of [[a, b], [b, a]] as const) {
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: me, kind: 'TEXT', text: 'hi' } });
    await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: other, kind: 'HEART' } });
    await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: me, lastReadAt: new Date() } });
    await prisma.statusNote.create({ data: { authorId: me, text: 'early night', expiresAt: later } });
    await prisma.report.create({ data: { reporterId: me, reportedUserId: other, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
  }
  return { aCode: aCode.code, bCode: bCode.code };
}

/** Rows of `model` whose role column (any of them) holds `userId`. */
async function rowsFor(model: SocialModel, userId: string): Promise<number> {
  const delegate = (prisma as unknown as Record<string, { count(args: object): Promise<number> }>)[model.charAt(0).toLowerCase() + model.slice(1)]!;
  return delegate.count({ where: { OR: SOCIAL_USER_COLUMNS[model].map((col) => ({ [col]: userId })) } });
}

describe('social tables stay outside the USER_OWNED_MODELS guard', () => {
  const models = Prisma.dmmf.datamodel.models;

  it('lists every model with a User relation that is not user-owned, and none of them has a userId column', () => {
    const relatesToUser = models
      .filter((m) => m.name !== 'User' && m.fields.some((f) => f.type === 'User'))
      .map((m) => m.name)
      .filter((name) => !(USER_OWNED_MODELS as readonly string[]).includes(name));
    expect(relatesToUser.sort()).toEqual([...SOCIAL_MODELS].sort());
    for (const name of SOCIAL_MODELS) {
      expect([name, models.find((m) => m.name === name)!.fields.some((f) => f.name === 'userId')]).toEqual([name, false]);
    }
  });

  it('cascades every role column, except the two SetNull ones', () => {
    for (const name of SOCIAL_MODELS) {
      const model = models.find((m) => m.name === name)!;
      for (const field of model.fields.filter((f) => f.type === 'User')) {
        const column = field.relationFromFields![0]!;
        expect(SOCIAL_USER_COLUMNS[name]).toContain(column);
        const expected = SET_NULL_COLUMNS.has(`${name}.${column}`) ? 'SetNull' : 'Cascade';
        expect([name, column, field.relationOnDelete]).toEqual([name, column, expected]);
      }
    }
  });
});

describe.each(['userAId', 'userBId'] as const)('deleting the user in BuddyPair.%s', (column) => {
  it('removes every social row that names them, nulls usedById, and leaves a bystander alone', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    const d = await newUser();
    const { aCode, bCode } = await seedSocial(a.id, b.id);
    // A bystander pair that shares nothing with a or b.
    await seedSocial(c.id, d.id);
    const pair = await prisma.buddyPair.findFirstOrThrow({ where: { OR: [{ userAId: a.id }, { userBId: a.id }] } });
    // Chosen by column, not by creation order, so each run covers both cascades whatever the ids.
    const doomedId = pair[column];
    const survivorId = doomedId === a.id ? b.id : a.id;
    const bystanderBefore = await Promise.all(SOCIAL_MODELS.map((m) => rowsFor(m, c.id)));

    await deleteUserAccount(doomedId, noop);

    expect(await prisma.buddyPair.findUnique({ where: { id: pair.id } })).toBeNull();
    for (const model of SOCIAL_MODELS) expect([model, await rowsFor(model, doomedId)]).toEqual([model, 0]);
    expect(await Promise.all(SOCIAL_MODELS.map((m) => rowsFor(m, c.id)))).toEqual(bystanderBefore);
    expect(await prisma.user.findUnique({ where: { id: survivorId } })).not.toBeNull();
    // The survivor's code that the deleted user redeemed survives with usedById nulled, not cascaded.
    const code = await prisma.buddyCode.findUniqueOrThrow({ where: { code: doomedId === a.id ? bCode : aCode } });
    expect([code.ownerId, code.usedById]).toEqual([survivorId, null]);
  });
});

it('deleting coach data leaves every social row in place', async () => {
  const a = await newUser();
  const b = await newUser();
  await seedSocial(a.id, b.id);
  const before = await Promise.all(SOCIAL_MODELS.map((m) => rowsFor(m, a.id)));
  await deleteUserCoachData(a.id);
  expect(await Promise.all(SOCIAL_MODELS.map((m) => rowsFor(m, a.id)))).toEqual(before);
});

it('allows at most one PENDING request per ordered pair (partial unique index)', async () => {
  const a = await newUser();
  const b = await newUser();
  await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id } });
  await expect(prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: a.id } });
  await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id, status: 'DECLINED' } });
});

it('refuses a BuddyPair stored out of order or with one user twice (CHECK userAId < userBId)', async () => {
  const a = await newUser();
  const b = await newUser();
  const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await expect(prisma.buddyPair.create({ data: { userAId: hi, userBId: lo } })).rejects.toThrow(/BuddyPair_ordered_check/);
  await expect(prisma.buddyPair.create({ data: { userAId: lo, userBId: lo } })).rejects.toThrow(/BuddyPair_ordered_check/);
  expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: lo }, { userBId: lo }] } })).toBe(0);
  await prisma.buddyPair.create({ data: { userAId: lo, userBId: hi } });
});
