import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { orderedPair } from '../../src/buddies/pairs';
import { deleteUserAccount } from '../../src/users/deletion';
import { buddyUser } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

// The same no-op Google deps as tests/buddies/deletion.test.ts.
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const LATER = new Date('2030-01-01T00:00:00Z');

async function chat() {
  const a = await buddyUser();
  const b = await buddyUser();
  const conversation = await prisma.conversation.create({ data: orderedPair(a.id, b.id) });
  const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: a.id, kind: 'TEXT', text: 'hi' } });
  return { a, b, conversation, message };
}

it('keeps one conversation per pair, stored in order', async () => {
  const { a, b } = await chat();
  await expect(prisma.conversation.create({ data: orderedPair(a.id, b.id) })).rejects.toMatchObject({ code: 'P2002' });
  const { userAId, userBId } = orderedPair(a.id, b.id);
  await expect(prisma.conversation.create({ data: { userAId: userBId, userBId: userAId } })).rejects.toThrow(/Conversation_ordered_check/);
});

it('gives new users read receipts and activity status on, message pushes on and previews off', async () => {
  const a = await buddyUser();
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: a.id },
    select: { lastActiveAt: true, chatReadReceipts: true, chatActivityStatus: true, notifyDirectMessages: true, showMessagePreviews: true },
  });
  expect(row).toEqual({ lastActiveAt: null, chatReadReceipts: true, chatActivityStatus: true, notifyDirectMessages: true, showMessagePreviews: false });
});

it('allows one reaction per person per message, one read row per reader, one Chats note per author, one report per reporter and target', async () => {
  const { a, b, conversation, message } = await chat();
  await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'HEART' } });
  await expect(prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'STAR' } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: b.id, lastReadAt: new Date() } });
  await expect(prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: b.id, lastReadAt: new Date() } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'early night', expiresAt: LATER } });
  await expect(prisma.statusNote.create({ data: { authorId: a.id, text: 'again', expiresAt: LATER } })).rejects.toMatchObject({ code: 'P2002' });
  const report = { reporterId: b.id, reportedUserId: a.id, targetType: 'MESSAGE' as const, targetId: message.id, reason: 'SPAM' as const };
  await prisma.report.create({ data: report });
  await expect(prisma.report.create({ data: { ...report, reason: 'OTHER' } })).rejects.toMatchObject({ code: 'P2002' });
});

it('a reply survives its original being deleted (SetNull); deleting the conversation removes its messages, reactions and reads', async () => {
  const { a, b, conversation, message } = await chat();
  const reply = await prisma.message.create({ data: { conversationId: conversation.id, senderId: b.id, kind: 'TEXT', text: 'yo', replyToMessageId: message.id } });
  await prisma.message.delete({ where: { id: message.id } });
  expect((await prisma.message.findUniqueOrThrow({ where: { id: reply.id } })).replyToMessageId).toBeNull();
  await prisma.messageReaction.create({ data: { messageId: reply.id, reactorId: a.id, kind: 'CHEER' } });
  await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: a.id, lastReadAt: new Date() } });
  // A report keeps its excerpt and outlives the conversation (unpair / block leave the evidence).
  await prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, targetType: 'MESSAGE', targetId: reply.id, reason: 'HARASSMENT', excerpt: 'yo' } });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  expect(await prisma.messageReaction.count({ where: { messageId: reply.id } })).toBe(0);
  expect(await prisma.conversationRead.count({ where: { conversationId: conversation.id } })).toBe(0);
  expect(await prisma.report.count({ where: { targetType: 'MESSAGE', targetId: reply.id } })).toBe(1);
});

it("deleting an account removes the pair's conversation and everything chat about them, on both sides", async () => {
  const { a, b, conversation, message } = await chat();
  await prisma.message.create({ data: { conversationId: conversation.id, senderId: b.id, kind: 'STICKER', sticker: 'CHEER' } });
  await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'HEART' } });
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'early night', expiresAt: LATER } });
  await prisma.statusNote.create({ data: { authorId: b.id, text: 'still here', expiresAt: LATER } });
  await prisma.report.create({ data: { reporterId: b.id, reportedUserId: a.id, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
  await prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, targetType: 'STATUS_NOTE', targetId: b.id, reason: 'OTHER' } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.conversation.count({ where: { id: conversation.id } })).toBe(0);
  expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  expect(await prisma.report.count({ where: { OR: [{ reporterId: a.id }, { reportedUserId: a.id }] } })).toBe(0);
  expect(await prisma.statusNote.count({ where: { authorId: b.id } })).toBe(1);
});
