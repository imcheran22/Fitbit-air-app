import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { CHATS_PAGE_SIZE, listChats, unreadChatsCount } from '../../src/chats/inbox';
import { findConversationId } from '../../src/chats/conversations';
import { markRead, sendMessage, unsendMessage } from '../../src/chats/messages';
import { saveCheckIn } from '../../src/social/checkins';
import { getSocialHome } from '../../src/social/home';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-08T18:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

/** The (time, id) a cursor carries: it must only ever be a live message's time. */
const cursorOf = (c: string | null) => (c === null ? null : (JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as [string, string]));

async function circleOf(n: number) {
  const me = await buddyUser({ displayName: 'Ana' });
  const buddies = [];
  for (let i = 0; i < n; i++) {
    const b = await buddyUser({ displayName: `B${i}` });
    await pairUp(me.id, b.id);
    buddies.push(b);
  }
  return { me, buddies };
}

it('lists conversations newest first, 30 a page by default, each with its last message, unread count and buddy', async () => {
  const { me, buddies: [sam, ben, cy] } = await circleOf(3);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: `rough night lol\n${'x'.repeat(100)}` }, at(1));
  await sendMessage(me.id, ben!.id, { kind: 'TEXT', text: 'you up?' }, at(2));
  await sendMessage(cy!.id, me.id, { kind: 'STICKER', sticker: 'CHEER' }, at(3));
  const first = await listChats(me.id, undefined, at(10), 2);
  expect(first.chats.map((c) => c.buddy.id)).toEqual([cy!.id, ben!.id]);
  expect(first.chats[0]).toEqual({
    buddy: expect.objectContaining({ id: cy!.id, displayName: 'B2' }),
    lastMessage: { mine: false, kind: 'STICKER', text: null, sticker: 'CHEER', cardType: null, at: at(3).toISOString() },
    unread: 1,
    activeAt: expect.any(String), // Cy sent a message at(3): active, and both share activity status
  });
  expect(first.chats[1]).toMatchObject({ lastMessage: { mine: true, kind: 'TEXT', text: 'you up?' }, unread: 0 });
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await listChats(me.id, first.nextCursor, at(10), 2);
  expect([second.chats.map((c) => c.buddy.id), second.nextCursor]).toEqual([[sam!.id], null]);
  // A text is one line of at most 80 code points.
  expect(second.chats[0]!.lastMessage.text).toBe(`rough night lol ${'x'.repeat(64)}…`); // 16 + 64 = 80
  expect(first.requests).toBe(0);
  expect(CHATS_PAGE_SIZE).toBe(30);
});

it('pages conversations whose newest live messages share a time by id, newest id first', async () => {
  const { me, buddies: [sam, ben] } = await circleOf(2);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'a' }, at(1));
  await sendMessage(ben!.id, me.id, { kind: 'TEXT', text: 'b' }, at(1));
  const ids = [[sam!.id, (await findConversationId(me.id, sam!.id))!], [ben!.id, (await findConversationId(me.id, ben!.id))!]]
    .sort((x, y) => (x[1]! < y[1]! ? 1 : -1));
  const first = await listChats(me.id, undefined, at(2), 1);
  expect([first.chats.map((c) => c.buddy.id), cursorOf(first.nextCursor)]).toEqual([[ids[0]![0]], [at(1).toISOString(), ids[0]![1]]]);
  const second = await listChats(me.id, first.nextCursor, at(2), 1);
  expect([second.chats.map((c) => c.buddy.id), second.nextCursor]).toEqual([[ids[1]![0]], null]);
});

it('counts only their unread messages; reading clears it; an all-unsent conversation is not listed', async () => {
  const { me, buddies: [sam, ben] } = await circleOf(2);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'one' }, at(1));
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'two' }, at(2));
  const gone = await sendMessage(ben!.id, me.id, { kind: 'TEXT', text: 'oops' }, at(3));
  expect((await listChats(me.id, undefined, at(4))).chats.map((c) => [c.buddy.id, c.unread])).toEqual([[ben!.id, 1], [sam!.id, 2]]);
  expect(await unreadChatsCount(me.id)).toBe(2);
  await unsendMessage(ben!.id, me.id, gone.id, at(5));
  await markRead(me.id, sam!.id, at(6));
  expect((await listChats(me.id, undefined, at(7))).chats.map((c) => [c.buddy.id, c.unread])).toEqual([[sam!.id, 0]]);
  expect(await unreadChatsCount(me.id)).toBe(0);
});

it('unsending the last message falls back to the previous live one, and the unread state follows it', async () => {
  const { me, buddies: [sam, ben, cy] } = await circleOf(3);
  await sendMessage(cy!.id, me.id, { kind: 'TEXT', text: 'cy here' }, at(0.5));
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'one' }, at(1));
  await sendMessage(me.id, sam!.id, { kind: 'TEXT', text: 'mine' }, at(2));
  const two = await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'two' }, at(3));
  await sendMessage(ben!.id, me.id, { kind: 'TEXT', text: 'ben here' }, at(3.5));
  const three = await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'three' }, at(4));
  const samRow = async () => (await listChats(me.id, undefined, at(10))).chats.find((c) => c.buddy.id === sam!.id)!;
  const order = async () => (await listChats(me.id, undefined, at(10))).chats.map((c) => c.buddy.id);
  // A page that ends on Sam's row: its cursor carries Sam's newest LIVE time, never an unsent one.
  const samCursor = async () => {
    const page = await listChats(me.id, undefined, at(10), 2);
    expect(page.chats[1]!.buddy.id).toBe(sam!.id);
    return cursorOf(page.nextCursor)![0];
  };
  expect(await samRow()).toMatchObject({ lastMessage: { mine: false, text: 'three', at: at(4).toISOString() }, unread: 2 });
  expect(await order()).toEqual([sam!.id, ben!.id, cy!.id]);
  // Their newest unsent: the line shows the one before it, and the unread count drops with it. The row moves to where
  // its newest live message puts it, below Ben's newer one: an unsend never lifts or pins a row.
  await unsendMessage(sam!.id, me.id, three.id, at(5));
  expect(await samRow()).toMatchObject({ lastMessage: { mine: false, text: 'two', at: at(3).toISOString() }, unread: 1 });
  expect(await order()).toEqual([ben!.id, sam!.id, cy!.id]);
  expect(await samCursor()).toBe(at(3).toISOString());
  expect(await unreadChatsCount(me.id)).toBe(3); // Sam's "two", Ben's and Cy's messages
  // Their only unread unsent: my own message is the last line again ("You:"), nothing unread from Sam.
  await unsendMessage(sam!.id, me.id, two.id, at(6));
  expect(await samRow()).toMatchObject({ lastMessage: { mine: true, kind: 'TEXT', text: 'mine', at: at(2).toISOString() }, unread: 0 });
  expect(await unreadChatsCount(me.id)).toBe(2); // Ben's and Cy's
  expect(await order()).toEqual([ben!.id, sam!.id, cy!.id]);
  expect(await samCursor()).toBe(at(2).toISOString());
});

it("the last line skips unsent messages and names a card's type; activity status is reciprocal", async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await saveCheckIn(me.id, 'RESTED', at(0));
  await sendMessage(me.id, sam!.id, { kind: 'CARD', card: { type: 'my_checkin' } }, at(1));
  const later = await sendMessage(me.id, sam!.id, { kind: 'TEXT', text: 'never mind' }, at(2));
  await unsendMessage(me.id, sam!.id, later.id, at(3));
  const row = (await listChats(sam!.id, undefined, at(4))).chats[0]!;
  expect(row.lastMessage).toEqual({ mine: false, kind: 'CARD', text: null, sticker: null, cardType: 'checkin', at: at(1).toISOString() });
  expect(row.activeAt).toBe(at(2).toISOString()); // my last send touched my presence
  await prisma.user.update({ where: { id: me.id }, data: { chatActivityStatus: false } });
  expect((await listChats(sam!.id, undefined, at(4))).chats[0]!.activeAt).toBeNull();
  // The viewer's own switch off hides the buddy's too.
  await prisma.user.update({ where: { id: me.id }, data: { chatActivityStatus: true } });
  await prisma.user.update({ where: { id: sam!.id }, data: { chatActivityStatus: false } });
  expect((await listChats(sam!.id, undefined, at(4))).chats[0]!.activeAt).toBeNull();
});

it('lists and counts conversations with current buddies only, and carries incoming requests', async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'hi' }, at(1));
  const stranger = await buddyUser();
  await prisma.buddyRequest.create({ data: { fromUserId: stranger.id, toUserId: me.id, createdAt: NOW } });
  expect((await listChats(me.id, undefined, at(2))).requests).toBe(1);
  expect(await unreadChatsCount(me.id)).toBe(1);
  // A pair row gone (unpair deletes the conversation too, Task 11; here only the pair): never listed, never counted.
  await prisma.buddyPair.deleteMany({ where: orderedPair(me.id, sam!.id) });
  expect(await unreadChatsCount(me.id)).toBe(0);
  expect(await listChats(me.id, undefined, at(2))).toEqual({ chats: [], nextCursor: null, requests: 1 });
  expect((await listChats(sam!.id, undefined, at(2))).chats).toEqual([]);
});

it('the Social home carries unread.chats; GET /me/chats answers the page, never cached', async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'hi' }, new Date(Date.now() - 60_000));
  expect((await getSocialHome(me.id, new Date())).unread).toEqual({ requests: 0, stickers: 0, chats: 1 });
  const res = await (await api()).get('/me/chats').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control'], res.body.chats.length, res.body.nextCursor, res.body.requests]).toEqual([200, 'private, no-store', 1, null, 0]);
  expect((await (await api()).get('/me/chats?cursor=junk').set(await authHeaderFor(me.id))).body).toEqual({ error: 'invalid_cursor' });
});
