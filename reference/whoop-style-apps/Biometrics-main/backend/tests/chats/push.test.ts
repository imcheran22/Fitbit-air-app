import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { buddyPushPayload, isPushPreview, renderBuddyPush } from '../../src/coach/push';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { unpair } from '../../src/buddies/relations';
import { claimDmPushSlot, pushPreviewOf, runDmNotice } from '../../src/chats/dmPush';
import { sendMessage, unsendMessage } from '../../src/chats/messages';
import { RecordingQueue, RecordingSender, addToken, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
let sender: RecordingSender;
beforeEach(() => {
  queue = new RecordingQueue();
  sender = new RecordingSender();
  setBuddyNotifyQueue(queue);
});
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-07T12:00:00Z'); // noon UTC: outside the default quiet hours (22:00-07:00)

async function chat() {
  const ana = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(ana.id, sam.id);
  await addToken(sam.id);
  return { ana, sam };
}

it('renders dm_message from typed slots: no preview by default, the one-line preview when sent', () => {
  expect(renderBuddyPush('dm_message', { name: 'Ana' })).toEqual({ title: 'Ana sent you a message', body: 'Open the app to read it.' });
  expect(renderBuddyPush('dm_message', { name: 'Ana', preview: 'rough night lol' })).toEqual({ title: 'Ana', body: 'rough night lol' });
  for (const preview of ['', 'two\nlines', ' padded ', 'x'.repeat(81), `${'x'.repeat(81)}…`, 7, '‮evil']) {
    expect(() => renderBuddyPush('dm_message', { name: 'Ana', preview } as never)).toThrow();
  }
  expect(() => renderBuddyPush('dm_message', { name: 'Ana', preview: 'hi', extra: 1 } as never)).toThrow();
  expect(isPushPreview(`${'x'.repeat(80)}…`)).toBe(true);
  expect(buddyPushPayload('dm_message', { name: 'Ana' }, '00000000-0000-4000-8000-000000000000').data).toEqual({ kind: 'dm_message', refId: '00000000-0000-4000-8000-000000000000' });
});

it('a preview keeps the joined emoji message text keeps, and no other format character', () => {
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  const scotland = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  expect(renderBuddyPush('dm_message', { name: 'Ana', preview: `${family} ${scotland} home` })).toEqual({ title: 'Ana', body: `${family} ${scotland} home` });
  for (const bad of ['zero\u200Bwidth', 'bidi\u2066x', 'soft\u00ADhyphen', 'a\u2028b']) expect(isPushPreview(bad)).toBe(false);
});

it('previews a text on one line and a card without text with a fixed phrase', () => {
  expect(pushPreviewOf({ text: 'rough\nnight', card: null })).toBe('rough night');
  expect(pushPreviewOf({ text: 'x'.repeat(90), card: null })).toBe(`${'x'.repeat(80)}…`);
  expect(pushPreviewOf({ text: 'same here', card: { type: 'note', text: 'early night' } })).toBe('same here');
  expect(pushPreviewOf({ text: null, card: { type: 'checkin', about: 'sender', localDate: '2026-10-07', mood: 'RESTED' } })).toBe('Shared their check-in');
  expect(pushPreviewOf({ text: null, card: { type: 'checkin', about: 'recipient', localDate: '2026-10-07', mood: null } })).toBe('Replied to your story');
  expect(pushPreviewOf({ text: null, card: { type: 'badge', family: 'SLEEP_GOAL', level: 2 } })).toBe('Replied to your story');
  expect(pushPreviewOf({ text: null, card: { type: 'note', text: 'x' } })).toBe('Replied to your note');
  expect(pushPreviewOf({ text: null, card: { type: 'camp_note', text: 'x' } })).toBe('Replied to your camp note');
});

it('a text enqueues one dm_message job carrying the message id and the name, never the text', async () => {
  const { ana, sam } = await chat();
  const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'secret chat words' }, NOW);
  expect(queue.jobs.map((j) => j.data)).toEqual([{ kind: 'dm_message', recipientId: sam.id, actorId: ana.id, refId: message.id, slots: { name: 'Ana' } }]);
  expect(JSON.stringify(queue.jobs)).not.toContain('secret chat');
});

it('sends "{name} sent you a message" with id-only data; with previews on, the name and the text', async () => {
  const { ana, sam } = await chat();
  await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  await queue.drain(sender, NOW);
  expect(sender.calls.map((c) => [c.payload.title, c.payload.body, c.payload.data])).toEqual([['Ana sent you a message', 'Open the app to read it.', { kind: 'dm_message', refId: ana.id }]]);
  // A second conversation, previews on.
  const ben = await buddyUser({ displayName: 'Ben' });
  await pairUp(ben.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { showMessagePreviews: true } });
  await sendMessage(ben.id, sam.id, { kind: 'TEXT', text: 'early night\ntonight?' }, NOW);
  await queue.drain(sender, NOW);
  expect([sender.calls[1]!.payload.title, sender.calls[1]!.payload.body]).toEqual(['Ben', 'early night tonight?']);
});

it('groups: at most one push per conversation per 2 minutes', async () => {
  const { ana, sam } = await chat();
  for (const text of ['one', 'two', 'three']) await sendMessage(ana.id, sam.id, { kind: 'TEXT', text }, NOW);
  await queue.drain(sender, NOW);
  expect(sender.calls).toHaveLength(1);
});

it('sends nothing for a message unsent before the job ran, for an ex-buddy, a mute, the setting off, or quiet hours', async () => {
  const cases: Array<[string, (ana: string, sam: string, messageId: string) => Promise<unknown>, Date]> = [
    ['unsent', (ana, sam, id) => unsendMessage(ana, sam, id, NOW), NOW],
    ['unpaired', (ana, sam) => unpair(sam, ana, NOW), NOW],
    ['muted', (ana, sam) => prisma.buddyMute.create({ data: { muterId: sam, mutedId: ana } }), NOW],
    ['setting off', (_ana, sam) => prisma.user.update({ where: { id: sam }, data: { notifyDirectMessages: false } }), NOW],
    ['quiet hours', async () => undefined, new Date('2026-10-07T23:00:00Z')],
  ];
  for (const [name, setUp, at] of cases) {
    const { ana, sam } = await chat();
    const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
    await setUp(ana.id, sam.id, message.id);
    await queue.drain(sender, at);
    expect([name, sender.calls.length]).toEqual([name, 0]);
  }
});

it('a sticker message sends only its buddy_sticker push, never a second dm_message', async () => {
  const { ana, sam } = await chat();
  await sendMessage(ana.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, NOW);
  expect(queue.jobs.map((j) => j.data.kind)).toEqual(['buddy_sticker']);
});

it('a slot that cannot be claimed sends nothing: grouped, and a Redis failure fails closed', async () => {
  const { ana, sam } = await chat();
  const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  const data = queue.jobs[0]!.data;
  expect(await runDmNotice(data, { pushSender: sender, now: NOW, claim: async () => false })).toBe('grouped');
  expect(sender.calls).toHaveLength(0);
  const failing = { set: async () => { throw new Error('redis down'); } };
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(await claimDmPushSlot(sam.id, ana.id, failing)).toBe(false);
  expect(errors.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(['chats.push_slot_unavailable']);
  errors.mockRestore();
  expect(message.id).toBe(data.refId);
});
