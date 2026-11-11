import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { CAMP_NOTE_MAX, checkCampNote, clearCampNote, noteIsLive, shareCampNote } from '../../src/social/campNotes';
import { saveCheckIn } from '../../src/social/checkins';
import type { Circle } from '../../src/social/circle';
import { api, buddyUser } from '../buddies/helpers';
import http from 'http';
import express from 'express';
import request from 'supertest';
import { lastErrorHandler } from '../../src/app';

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles

it('sanitises like a display name: NFC, controls and zero-widths out, trimmed, 1–40 code points, no reserved-word check', () => {
  expect(checkCampNote('  bed soon  ')).toBe('bed soon');
  expect(checkCampNote('night\nall')).toBe('nightall');
  expect(checkCampNote('e\u0301')).toBe('\u00e9');
  expect(checkCampNote('\u200b \u200d')).toBeNull();
  expect(checkCampNote('')).toBeNull();
  expect(checkCampNote(42)).toBeNull();
  expect(checkCampNote('x'.repeat(CAMP_NOTE_MAX))).toBe('x'.repeat(40));
  expect(checkCampNote('x'.repeat(41))).toBeNull();
  expect(checkCampNote('🔥'.repeat(40))).toBe('🔥'.repeat(40)); // code points, not UTF-16 units
  expect(checkCampNote('🔥'.repeat(41))).toBeNull();
  expect(checkCampNote('admin says night')).toBe('admin says night');
  // No link or mention filter in S2 (reports arrive in S3).
  expect(checkCampNote('see example.com @sam')).toBe('see example.com @sam');
});

it('a note is live until it expires or its author checks in at or after it', () => {
  const note = { authorId: 'a', createdAt: NIGHT, expiresAt: new Date('2026-10-08T13:00:00Z') };
  const circle = (checkInAt?: Date) => ({
    checkIns: new Map(checkInAt ? [['a', { createdAt: checkInAt }]] : []),
  }) as unknown as Circle;
  expect(noteIsLive(note, circle(), new Date('2026-10-08T12:59:59Z'))).toBe(true);
  expect(noteIsLive(note, circle(), new Date('2026-10-08T13:00:00Z'))).toBe(false);
  expect(noteIsLive(note, circle(new Date('2026-10-08T05:00:00Z')), NIGHT)).toBe(true); // checked in before it
  expect(noteIsLive(note, circle(NIGHT), NIGHT)).toBe(false); // at it
  expect(noteIsLive(note, circle(new Date('2026-10-08T12:00:00Z')), new Date('2026-10-08T12:30:00Z'))).toBe(false);
});

it('keeps one note per author that clears at the next 06:00 in their zone; sharing again replaces it; clear removes it', async () => {
  const me = await buddyUser({ timezone: LA });
  expect(await shareCampNote(me.id, ' bed soon ', NIGHT)).toEqual({ text: 'bed soon', createdAt: NIGHT.toISOString(), expiresAt: '2026-10-08T13:00:00.000Z' });
  const morning = new Date('2026-10-08T14:00:00Z'); // Oct 8, 07:00
  expect(await shareCampNote(me.id, 'up early', morning)).toEqual({ text: 'up early', createdAt: morning.toISOString(), expiresAt: '2026-10-09T13:00:00.000Z' });
  expect(await prisma.campNote.findMany({ where: { authorId: me.id }, select: { text: true } })).toEqual([{ text: 'up early' }]);
  await clearCampNote(me.id);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  await expect(clearCampNote(me.id)).resolves.toBeUndefined(); // nothing to clear: fine
});

it('refuses an invalid note and stores nothing', async () => {
  const me = await buddyUser();
  await expect(shareCampNote(me.id, '   ', NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  await expect(shareCampNote(me.id, 'x'.repeat(41), NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  await expect(shareCampNote(me.id, undefined, NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("the author's first check-in of the day clears a note written before it; a note written after survives an edit", async () => {
  const me = await buddyUser({ timezone: LA });
  await shareCampNote(me.id, 'night all', NIGHT);
  await saveCheckIn(me.id, 'RESTED', new Date('2026-10-08T14:00:00Z')); // Oct 8, 07:00: the day's first check-in
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  await shareCampNote(me.id, 'coffee first', new Date('2026-10-08T14:30:00Z'));
  await saveCheckIn(me.id, 'OKAY', new Date('2026-10-08T15:00:00Z')); // an edit of that day's check-in
  expect(await prisma.campNote.findMany({ where: { authorId: me.id }, select: { text: true } })).toEqual([{ text: 'coffee first' }]);
});

it('spends the 20-an-hour bucket on sharing only, failing closed', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(shareCampNote(me.id, 'hi', NIGHT)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(shareCampNote(me.id, 'hi', NIGHT)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.campNote, me.id);
  expect(rateLimit.RATE_LIMITS.campNote).toEqual({ name: 'camp_note', limit: 20, windowSeconds: 3600 });
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('clearing my own note never touches the bucket, and works while the limiter is down or spent', async () => {
  const me = await buddyUser();
  await prisma.campNote.create({ data: { authorId: me.id, text: 'mine', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockRejectedValue(new Error('redis down'));
  await expect(clearCampNote(me.id)).resolves.toBeUndefined();
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  // Through the route too, with the bucket spent.
  spy.mockResolvedValue('limited');
  await prisma.campNote.create({ data: { authorId: me.id, text: 'again', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  const res = await (await api()).delete('/me/camp/note').set(await authHeaderFor(me.id));
  expect(res.status).toBe(204);
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('the 21st share in an hour is rate_limited, and clearing still works', async () => {
  const me = await buddyUser();
  // One fixed clock for every call: all 21 land in the same hourly window.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  for (let i = 0; i < 20; i++) await shareCampNote(me.id, `note ${i}`, NIGHT);
  await expect(shareCampNote(me.id, 'one more', NIGHT)).rejects.toMatchObject({ code: 'rate_limited' });
  await clearCampNote(me.id);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

// Tripwire only (ruling P6): it sees console calls on these two paths in this process, nothing more. The real check
// is the backend-wide grep of console./log( calls for note text, run at review (Tasks 5 and 17).
it('never logs the note text (tripwire)', async () => {
  const me = await buddyUser();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await shareCampNote(me.id, 'secret campfire words', NIGHT);
  await expect(shareCampNote(me.id, 'secret campfire words but far too long to fit', NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret campfire');
});

it('routes: PUT shares (200 { note }), an invalid one is 400 invalid_note, DELETE is 204, and auth is required', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put('/me/camp/note').set(headers).send({ text: ' night all ' });
  expect([put.status, put.body.note.text]).toEqual([200, 'night all']);
  expect(Object.keys(put.body.note).sort()).toEqual(['createdAt', 'expiresAt', 'text']);
  const bad = await agent.put('/me/camp/note').set(headers).send({ text: '' });
  expect([bad.status, bad.body]).toEqual([400, { error: 'invalid_note' }]);
  expect((await agent.put('/me/camp/note').set(headers).send({})).body).toEqual({ error: 'invalid_note' });
  expect((await agent.delete('/me/camp/note').set(headers)).status).toBe(204);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  expect((await agent.put('/me/camp/note').send({ text: 'hi' })).status).toBe(401);
});

// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

it('refuses a lone surrogate before the limiter: the route answers 400 invalid_note, not a 500, and spends no token', async () => {
  expect(checkCampNote(`hi${LONE_SURROGATE}`)).toBeNull();
  expect(checkCampNote(`${String.fromCharCode(0xdc00)}hi`)).toBeNull();
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  const res = await (await api()).put('/me/camp/note').set(await authHeaderFor(me.id)).send({ text: `hi${LONE_SURROGATE}` });
  expect([res.status, res.body]).toEqual([400, { error: 'invalid_note' }]);
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('a non-string text through the route is 400 invalid_note', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  for (const text of [['night all'], { text: 'night all' }, 42, null]) {
    const res = await agent.put('/me/camp/note').set(headers).send({ text });
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_note' }]);
  }
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("a note written after midnight is cleared by that morning's first check-in", async () => {
  const me = await buddyUser({ timezone: LA });
  await shareCampNote(me.id, 'cannot sleep', new Date('2026-10-08T08:00:00Z')); // Oct 8, 01:00
  await saveCheckIn(me.id, 'TIRED', new Date('2026-10-08T14:00:00Z')); // Oct 8, 07:00: the day's first check-in
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("a note written after the day's check-in survives edits of it and is cleared by the next day's first check-in", async () => {
  const me = await buddyUser({ timezone: LA });
  await saveCheckIn(me.id, 'RESTED', new Date('2026-10-08T14:00:00Z')); // Oct 8, 07:00
  await shareCampNote(me.id, 'night all', new Date('2026-10-09T06:00:00Z')); // Oct 8, 23:00
  await saveCheckIn(me.id, 'OKAY', new Date('2026-10-09T06:30:00Z')); // Oct 8, 23:30: an edit of Oct 8's check-in
  expect(await prisma.campNote.findMany({ where: { authorId: me.id }, select: { text: true } })).toEqual([{ text: 'night all' }]);
  await saveCheckIn(me.id, 'RESTED', new Date('2026-10-09T14:00:00Z')); // Oct 9, 07:00: the next day's first check-in
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

describe("the app's last error handler (fix round 1)", () => {
  const consoleCalls = () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    return () => spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)));
  };

  it('answers a malformed JSON body with 400 bad_request and logs only the status and type, never the body', async () => {
    const me = await buddyUser();
    const headers = await authHeaderFor(me.id);
    const agent = await api();
    const logged = consoleCalls();
    const res = await agent.put('/me/camp/note').set(headers).set('Content-Type', 'application/json').send('{"text": "secret campfire words');
    expect([res.status, res.body]).toEqual([400, { error: 'bad_request' }]);
    const lines = logged();
    for (const line of lines) expect(line).not.toContain('secret campfire');
    expect(lines).toContain(JSON.stringify([JSON.stringify({ event: 'http.error', status: 400, type: 'entity.parse.failed' })]));
  });

  it('answers an unexpected error with 500 internal and never logs its message', async () => {
    const me = await buddyUser();
    const headers = await authHeaderFor(me.id);
    const agent = await api();
    jest.spyOn(prisma.campNote, 'upsert').mockRejectedValue(new Error('secret campfire words in a message'));
    const logged = consoleCalls();
    const res = await agent.put('/me/camp/note').set(headers).send({ text: 'hello' });
    expect([res.status, res.body]).toEqual([500, { error: 'internal' }]);
    const lines = logged();
    for (const line of lines) expect(line).not.toContain('secret campfire');
    expect(lines).toContain(JSON.stringify([JSON.stringify({ event: 'http.error', status: 500, type: 'Error' })]));
  });

  it('after headers are sent it logs the same line and destroys the response, never handing the error to Express', async () => {
    const app = express();
    app.get('/streaming', (_req, res, next) => {
      res.write('partial');
      next(new Error('secret campfire words in a message'));
    });
    app.use(lastErrorHandler);
    const destroy = jest.spyOn(http.ServerResponse.prototype, 'destroy');
    const logged = consoleCalls();
    await expect(request(app).get('/streaming')).rejects.toThrow();
    expect(destroy).toHaveBeenCalled();
    const lines = logged();
    for (const line of lines) expect(line).not.toContain('secret campfire');
    expect(lines).toEqual([JSON.stringify([JSON.stringify({ event: 'http.error', status: 500, type: 'Error' })])]);
  });

  it('a started response is never passed to next', () => {
    const res = { headersSent: true, destroy: jest.fn() } as unknown as express.Response;
    const next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    lastErrorHandler(new Error('x'), {} as express.Request, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.destroy).toHaveBeenCalledTimes(1);
  });
});
