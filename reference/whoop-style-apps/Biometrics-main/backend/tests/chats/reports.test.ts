import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { blockBuddy, unpair } from '../../src/buddies/relations';
import { deleteUserAccount } from '../../src/users/deletion';
import { sendMessage, unsendMessage } from '../../src/chats/messages';
import { shareStatusNote } from '../../src/chats/notes';
import { REPORT_RETENTION_DAYS, fileReport } from '../../src/chats/reports';
import { shareCampNote } from '../../src/social/campNotes';
import { saveCheckIn } from '../../src/social/checkins';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
beforeEach(() => {
  queue = new RecordingQueue();
  setBuddyNotifyQueue(queue);
});
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T05:00:00Z'); // 05:00 for these UTC users: night, so camp notes are live
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

async function buddies() {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  return { me, sam };
}

it("stores a message report with the reporter, the reported person, the reason and the text as it was; a second report updates it", async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'buy cheap pills here' }, NOW);
  queue.jobs = [];
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'spam' }, NOW);
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'harassment' }, NOW);
  const rows = await prisma.report.findMany({ where: { reporterId: me.id } });
  expect(rows.map((r) => [r.reportedUserId, r.targetType, r.targetId, r.reason, r.excerpt])).toEqual([[sam.id, 'MESSAGE', message.id, 'HARASSMENT', 'buy cheap pills here']]);
  // The reported person is never told: no job, nothing to read.
  expect(queue.jobs).toEqual([]);
  expect((await (await api()).get('/me/reports').set(await authHeaderFor(sam.id))).status).toBe(404);
});

it("snapshots a buddy's Chats note and camp note, by their author's id", async () => {
  const { me, sam } = await buddies();
  await shareStatusNote(sam.id, 'mean words here', NOW);
  await shareCampNote(sam.id, 'more mean words', NOW);
  await fileReport(me.id, { targetType: 'status_note', targetId: sam.id, reason: 'harassment' }, NOW);
  await fileReport(me.id, { targetType: 'camp_note', targetId: sam.id, reason: 'other' }, NOW);
  const rows = await prisma.report.findMany({ where: { reporterId: me.id } });
  expect(rows.map((r) => [r.targetType, r.targetId, r.reportedUserId, r.excerpt]).sort()).toEqual([
    ['CAMP_NOTE', sam.id, sam.id, 'more mean words'],
    ['STATUS_NOTE', sam.id, sam.id, 'mean words here'],
  ]);
});

it('only what I can see now: my own message, an unsent one, a stranger and a missing note are report_target_gone', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  const mine = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  const theirs = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'bye' }, NOW);
  await unsendMessage(sam.id, me.id, theirs.id, NOW);
  await shareStatusNote(stranger.id, 'stranger note', NOW);
  const cases = [
    { targetType: 'message', targetId: mine.id },
    { targetType: 'message', targetId: theirs.id },
    { targetType: 'message', targetId: '00000000-0000-4000-8000-000000000000' },
    { targetType: 'status_note', targetId: stranger.id },
    { targetType: 'status_note', targetId: sam.id },
    { targetType: 'camp_note', targetId: sam.id },
    { targetType: 'message', targetId: 'nope' },
  ];
  for (const c of cases) await expect(fileReport(me.id, { ...c, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(0);
});

it('an unknown target type or reason is invalid_report, before the limiter', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const body of [{ targetType: 'user', targetId: sam.id, reason: 'spam' }, { targetType: 'message', targetId: sam.id, reason: 'rude' }, {}, null, ['message']]) {
    await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'invalid_report' });
  }
  expect(spy).not.toHaveBeenCalled();
});

it('reports spend the 20-an-hour bucket, failing closed', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'x' }, NOW);
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  const body = { targetType: 'message', targetId: message.id, reason: 'spam' };
  await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.report, me.id);
});

it('"Block too": the report and its excerpt outlive the block that deletes the conversation', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'threatening words' }, NOW);
  const res = await (await api()).post('/me/reports').set(await authHeaderFor(me.id)).send({ targetType: 'message', targetId: message.id, reason: 'harassment' });
  expect(res.status).toBe(204);
  await blockBuddy(me.id, sam.id, NOW);
  expect(await prisma.report.findFirstOrThrow({ where: { reporterId: me.id } })).toMatchObject({ excerpt: 'threatening words', reportedUserId: sam.id });
});

// Tripwire only; the backend-wide grep (Task 19) is the real check.
it('never logs the reported text (tripwire)', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'secret report words' }, NOW);
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'spam' }, NOW);
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret report');
});

it('keeps reports 90 days', () => {
  expect(REPORT_RETENTION_DAYS).toBe(90);
});

it('the excerpt is a snapshot: it outlives an unsend and an unpair', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'words to keep' }, NOW);
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'other' }, NOW);
  await unsendMessage(sam.id, me.id, message.id, NOW);
  await unpair(me.id, sam.id, NOW);
  expect(await prisma.report.findFirstOrThrow({ where: { reporterId: me.id } })).toMatchObject({ excerpt: 'words to keep', reportedUserId: sam.id });
});

it("a CARD message's excerpt is the sender's own reply only, never the quoted item", async () => {
  const { me, sam } = await buddies();
  await shareStatusNote(me.id, 'my own note', NOW);
  const withText = await sendMessage(sam.id, me.id, { kind: 'CARD', card: { type: 'note' }, text: 'rude reply' }, NOW);
  const bare = await sendMessage(sam.id, me.id, { kind: 'CARD', card: { type: 'note' } }, NOW);
  const sticker = await sendMessage(sam.id, me.id, { kind: 'STICKER', sticker: 'CHEER' }, NOW);
  for (const m of [withText, bare, sticker!]) await fileReport(me.id, { targetType: 'message', targetId: m.id, reason: 'spam' }, NOW);
  const rows = await prisma.report.findMany({ where: { reporterId: me.id } });
  const byId = new Map(rows.map((r) => [r.targetId, r.excerpt]));
  expect([byId.get(withText.id), byId.get(bare.id), byId.get(sticker!.id)]).toEqual(['rude reply', null, null]);
});

it('after an unpair nothing of the ex-buddy can be reported: the same answer as for a stranger', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'later words' }, NOW);
  await shareStatusNote(sam.id, 'note words', NOW);
  await shareCampNote(sam.id, 'camp words', NOW);
  await unpair(me.id, sam.id, NOW);
  for (const c of [
    { targetType: 'message', targetId: message.id },
    { targetType: 'status_note', targetId: sam.id },
    { targetType: 'camp_note', targetId: sam.id },
  ]) await expect(fileReport(me.id, { ...c, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(0);
});

it('my own notes, an expired Chats note and a camp note cleared by a check-in are report_target_gone', async () => {
  const { me, sam } = await buddies();
  await shareStatusNote(me.id, 'mine', NOW);
  await shareCampNote(me.id, 'mine too', NOW);
  await shareStatusNote(sam.id, 'old words', new Date(NOW.getTime() - 25 * 60 * 60 * 1000));
  await shareCampNote(sam.id, 'camp words', new Date(NOW.getTime() - 60 * 60 * 1000));
  await saveCheckIn(sam.id, 'RESTED', new Date(NOW.getTime() - 30 * 60 * 1000));
  for (const c of [
    { targetType: 'status_note', targetId: me.id },
    { targetType: 'camp_note', targetId: me.id },
    { targetType: 'status_note', targetId: sam.id },
    { targetType: 'camp_note', targetId: sam.id },
  ]) await expect(fileReport(me.id, { ...c, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
});

it('reports go with either account', async () => {
  const { me, sam } = await buddies();
  const cy = await buddyUser();
  await pairUp(cy.id, sam.id);
  const toMe = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'a' }, NOW);
  const toCy = await sendMessage(sam.id, cy.id, { kind: 'TEXT', text: 'b' }, NOW);
  await fileReport(me.id, { targetType: 'message', targetId: toMe.id, reason: 'spam' }, NOW);
  await fileReport(cy.id, { targetType: 'message', targetId: toCy.id, reason: 'spam' }, NOW);
  await deleteUserAccount(me.id, noop);
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(0);
  expect(await prisma.report.count({ where: { reporterId: cy.id } })).toBe(1);
  await deleteUserAccount(sam.id, noop);
  expect(await prisma.report.count({ where: { reportedUserId: sam.id } })).toBe(0);
});

it('a race with an account deletion is a coded refusal, never a 500', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'x' }, NOW);
  await shareStatusNote(sam.id, 'n', NOW);
  await shareCampNote(sam.id, 'c', NOW);
  // An account goes between the visibility check and the write (no FK target).
  jest.spyOn(prisma.report, 'upsert').mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));
  await expect(fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
  // A reporter already gone, for every target type.
  await deleteUserAccount(me.id, noop);
  for (const c of [
    { targetType: 'message', targetId: message.id },
    { targetType: 'status_note', targetId: sam.id },
    { targetType: 'camp_note', targetId: sam.id },
  ]) await expect(fileReport(me.id, { ...c, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
});

it('two first reports at once leave one row, never a 500', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'x' }, NOW);
  const body = { targetType: 'message', targetId: message.id, reason: 'spam' };
  await Promise.all([fileReport(me.id, body, NOW), fileReport(me.id, body, NOW), fileReport(me.id, body, NOW)]);
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(1);
});

it('route: 204, 400 invalid_report, 404 report_target_gone, auth required', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'x' }, NOW);
  const agent = await api();
  const auth = await authHeaderFor(me.id);
  expect((await agent.post('/me/reports').set(auth).send({ targetType: 'message', targetId: message.id, reason: 'spam' })).status).toBe(204);
  const bad = await agent.post('/me/reports').set(auth).send({ targetType: 'message', targetId: message.id, reason: 'rude' });
  expect([bad.status, bad.body]).toEqual([400, { error: 'invalid_report' }]);
  const gone = await agent.post('/me/reports').set(auth).send({ targetType: 'status_note', targetId: sam.id, reason: 'spam' });
  expect([gone.status, gone.body]).toEqual([404, { error: 'report_target_gone' }]);
  expect((await agent.post('/me/reports').send({ targetType: 'message', targetId: message.id, reason: 'spam' })).status).toBe(401);
});

// Final review M9 (T10): a buddy's message in a conversation I am not part of is not mine to report.
it("a buddy's message to someone else is report_target_gone", async () => {
  const { me, sam } = await buddies();
  const kim = await buddyUser();
  await pairUp(sam.id, kim.id);
  const elsewhere = await sendMessage(sam.id, kim.id, { kind: 'TEXT', text: 'not for you' }, NOW);
  await expect(fileReport(me.id, { targetType: 'message', targetId: elsewhere.id, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(0);
});
