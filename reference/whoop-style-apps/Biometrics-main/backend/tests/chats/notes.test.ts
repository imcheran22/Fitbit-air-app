import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { blockBuddy, unpair } from '../../src/buddies/relations';
import { deleteUserAccount } from '../../src/users/deletion';
import { clearStatusNote, getNotes, shareStatusNote } from '../../src/chats/notes';
import { api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
afterEach(() => jest.restoreAllMocks());

const NOW = new Date('2026-10-08T18:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

it('keeps one note per author for 24 hours; sharing again replaces it; clearing removes it', async () => {
  const me = await buddyUser();
  expect(await shareStatusNote(me.id, ' early\nnight tonight ', NOW)).toEqual({ text: 'earlynight tonight', createdAt: NOW.toISOString(), expiresAt: hours(24).toISOString() });
  expect(await shareStatusNote(me.id, '10k or bust', hours(1))).toEqual({ text: '10k or bust', createdAt: hours(1).toISOString(), expiresAt: hours(25).toISOString() });
  expect((await getNotes(me.id, hours(2))).mine).toMatchObject({ text: '10k or bust' });
  expect((await getNotes(me.id, hours(25))).mine).toBeNull(); // expired: hidden before the sweep
  await clearStatusNote(me.id);
  await clearStatusNote(me.id); // nothing left: fine
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("shows me my buddies' live notes, newest first, and never a stranger's or an ex-buddy's", async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const ben = await buddyUser({ displayName: 'Ben' });
  const stranger = await buddyUser();
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ben.id);
  await shareStatusNote(sam.id, 'day 6 streak!', NOW);
  await shareStatusNote(ben.id, 'early night tonight', hours(1));
  await shareStatusNote(stranger.id, 'hello', hours(1));
  const notes = await getNotes(me.id, hours(2));
  expect(notes.buddies.map((n) => [n.person.displayName, n.text])).toEqual([['Ben', 'early night tonight'], ['Sam', 'day 6 streak!']]);
  expect(notes.mine).toBeNull();
  await unpair(me.id, ben.id, hours(2));
  expect((await getNotes(me.id, hours(2))).buddies.map((n) => n.person.displayName)).toEqual(['Sam']);
  expect((await getNotes(ben.id, hours(2))).buddies).toEqual([]);
});

it("hides a blocked person's note at once, on both sides, and a buddy's expired note", async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const kim = await buddyUser({ displayName: 'Kim' });
  await pairUp(me.id, sam.id);
  await pairUp(me.id, kim.id);
  await shareStatusNote(me.id, 'mine', NOW);
  await shareStatusNote(sam.id, 'sam note', NOW);
  await shareStatusNote(kim.id, 'kim note', hours(-23));
  expect((await getNotes(me.id, hours(1))).buddies.map((n) => n.person.displayName)).toEqual(['Sam']); // Kim's expired
  await blockBuddy(me.id, sam.id, hours(1));
  expect((await getNotes(me.id, hours(1))).buddies).toEqual([]);
  expect((await getNotes(sam.id, hours(1))).buddies).toEqual([]);
});

it('refuses a bad note before the limiter, and stores nothing', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const bad of ['', '   ', 'x'.repeat(61), '​', 9, undefined, `hi${LONE_SURROGATE}`]) {
    await expect(shareStatusNote(me.id, bad, NOW)).rejects.toMatchObject({ code: 'invalid_status_note' });
  }
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
  expect(await shareStatusNote(me.id, '🔥'.repeat(60), NOW)).toMatchObject({ text: '🔥'.repeat(60) });
});

it('spends the 20-an-hour bucket on sharing, failing closed; clearing never touches it', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(shareStatusNote(me.id, 'hi', NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(shareStatusNote(me.id, 'hi', NOW)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.statusNote, me.id);
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
  spy.mockReset();
  spy.mockRejectedValue(new Error('redis down'));
  await prisma.statusNote.create({ data: { authorId: me.id, text: 'mine', expiresAt: hours(24) } });
  const res = await (await api()).delete('/me/notes').set(await authHeaderFor(me.id));
  expect(res.status).toBe(204);
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('a share racing account deletion is a coded refusal, never a 500; clearing and reading stay quiet', async () => {
  const me = await buddyUser();
  await deleteUserAccount(me.id, noop);
  await expect(shareStatusNote(me.id, 'too late', NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  await expect(clearStatusNote(me.id)).resolves.toBeUndefined();
  expect(await getNotes(me.id, NOW)).toEqual({ mine: null, buddies: [] });
});

it('routes: GET is no-store, PUT answers { note }, a bad one is 400 invalid_status_note, auth is required', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put('/me/notes').set(headers).send({ text: 'early night tonight' });
  expect([put.status, Object.keys(put.body.note).sort()]).toEqual([200, ['createdAt', 'expiresAt', 'text']]);
  const get = await agent.get('/me/notes').set(headers);
  expect([get.headers['cache-control'], get.body.mine.text, get.body.buddies]).toEqual(['private, no-store', 'early night tonight', []]);
  expect((await agent.put('/me/notes').set(headers).send({ text: ['x'] })).body).toEqual({ error: 'invalid_status_note' });
  expect((await agent.get('/me/notes')).status).toBe(401);
});

// Tripwire only; the backend-wide grep (Task 19) is the real check.
it('never logs the note text (tripwire)', async () => {
  const me = await buddyUser();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await shareStatusNote(me.id, 'secret note words', NOW);
  await expect(shareStatusNote(me.id, `secret note words ${'x'.repeat(60)}`, NOW)).rejects.toMatchObject({ code: 'invalid_status_note' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret note');
});
