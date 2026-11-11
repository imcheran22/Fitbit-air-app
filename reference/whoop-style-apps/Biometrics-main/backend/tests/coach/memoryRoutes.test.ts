import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import { ScriptedStreamProvider, StreamStep } from '../../src/coach/model/provider';
import { LEGACY_DISCLAIMER } from '../../src/coach/answer/history';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { FakeClock, RecordingTelemetry, createUser } from './helpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  jest.restoreAllMocks();
});

async function authed(userId: string) {
  return authHeaderFor(userId);
}

function scriptedApp(script: StreamStep[]) {
  const provider = new ScriptedStreamProvider(script);
  const app = express();
  app.use(express.json());
  app.use(createCoachRouter({ getProvider: () => provider, telemetry: new RecordingTelemetry(), clock: new FakeClock() }));
  return { app, provider };
}

async function consented() {
  const user = await createUser();
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

const mem = (userId: string, over: Partial<{ value: string; status: 'PENDING' | 'CONFIRMED'; category: 'TRAINING_GOAL' | 'SCHEDULE' | 'PREFERENCE'; createdAt: Date }> = {}) =>
  prisma.coachMemory.create({
    data: { userId, category: 'PREFERENCE', value: 'Likes short answers', status: 'CONFIRMED', confirmedAt: new Date(), ...over },
  });

const NEW_ROUTES = [
  ['get', '/me/coach/memory'],
  ['patch', '/me/coach/memory/some-id'],
  ['delete', '/me/coach/memory/some-id'],
  ['get', '/me/coach/digests/latest'],
] as const;

describe('auth and flag', () => {
  it.each(NEW_ROUTES)('%s %s requires a bearer token (flag on and off)', async (method, path) => {
    expect((await request(await testServer(createApp()))[method](path)).status).toBe(401);
    process.env.COACH_ENABLED = 'false';
    expect((await request(await testServer(createApp()))[method](path)).status).toBe(401);
  });

  it.each(NEW_ROUTES)('%s %s returns 404 coach_disabled when the flag is off', async (method, path) => {
    process.env.COACH_ENABLED = 'false';
    const user = await consented();
    const res = await request(await testServer(createApp()))
      [method](path)
      .set(await authed(user.id))
      .send({ value: 'x', token: 'abc', platform: 'ios' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'coach_disabled' });
  });
});

describe('POST /me/coach/message memoryProposals', () => {
  it('returns the entries created this turn, keeps every existing field, and the next uncorrected message confirms them', async () => {
    const { app } = scriptedApp([
      'Great, a morning routine helps.\n```memory\n{"category":"SCHEDULE","value":"Runs at 6am on weekdays"}\n```',
      'Happy to help with that.',
    ]);
    const user = await consented();

    const first = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'I usually run at 6am on weekdays' });

    expect(first.status).toBe(200);
    expect(Object.keys(first.body).sort()).toEqual(['conversationId', 'memoryProposals', 'message']);
    expect(Object.keys(first.body.message).sort()).toEqual(['createdAt', 'id', 'role', 'source', 'text']);
    // The proposal travels as memoryProposals (the app shows it as a chip); no memory note is added to the
    // reply text. Old builds get the disclaimer on this JSON response only (R46); the row stays clean.
    expect(first.body.message.text).toBe(`Great, a morning routine helps.\n\n${LEGACY_DISCLAIMER}`);
    expect((await prisma.coachMessage.findUniqueOrThrow({ where: { id: first.body.message.id } })).text).toBe('Great, a morning routine helps.');
    expect(first.body.memoryProposals).toHaveLength(1);
    const dto = first.body.memoryProposals[0];
    expect(Object.keys(dto).sort()).toEqual(['category', 'createdAt', 'id', 'status', 'value']);
    expect(dto).toMatchObject({ category: 'SCHEDULE', value: 'Runs at 6am on weekdays', status: 'PENDING' });
    expect(new Date(dto.createdAt).toISOString()).toBe(dto.createdAt);

    const second = await request(await testServer(app))
      .post('/me/coach/message')
      .set(await authed(user.id))
      .send({ message: 'thanks, what about my sleep', conversationId: first.body.conversationId });
    expect(second.status).toBe(200);
    expect(second.body.memoryProposals).toBeUndefined();
    const listed = await request(await testServer(app)).get('/me/coach/memory').set(await authed(user.id));
    expect(listed.body.entries.map((e: any) => e.status)).toEqual(['CONFIRMED']);
  });

  it('omits memoryProposals when nothing was proposed', async () => {
    const { app } = scriptedApp(['All good.']);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect('memoryProposals' in res.body).toBe(false);
  });
});

describe('GET /me/coach/memory', () => {
  it('lists only the caller\'s entries (PENDING and CONFIRMED), newest first, as MemoryDTO', async () => {
    const user = await createUser(); // no consent needed to view what is stored
    const other = await createUser();
    await mem(user.id, { value: 'Oldest', createdAt: new Date(Date.now() - 3000) });
    await mem(user.id, { value: 'Newest', status: 'PENDING', createdAt: new Date(Date.now() - 1000) });
    await mem(other.id, { value: 'Not mine' });

    const res = await request(await testServer(createApp())).get('/me/coach/memory').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['entries']);
    expect(res.body.entries.map((e: any) => e.value)).toEqual(['Newest', 'Oldest']);
    expect(Object.keys(res.body.entries[0]).sort()).toEqual(['category', 'createdAt', 'id', 'status', 'value']);
    expect(res.body.entries[0].status).toBe('PENDING');
  });

  it('returns an empty list for a user with none', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/memory').set(await authed(user.id));
    expect(res.body).toEqual({ entries: [] });
  });
});

describe('PATCH /me/coach/memory/:id', () => {
  it('edits the value (trimmed), keeps category and status, and returns { entry }', async () => {
    const user = await createUser();
    const row = await mem(user.id, { status: 'PENDING' });

    const res = await request(await testServer(createApp()))
      .patch(`/me/coach/memory/${row.id}`)
      .set(await authed(user.id))
      .send({ value: '  Prefers detailed answers  ' });

    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({ id: row.id, value: 'Prefers detailed answers', status: 'PENDING', category: 'PREFERENCE' });
    expect((await prisma.coachMemory.findUnique({ where: { id: row.id } }))?.value).toBe('Prefers detailed answers');
  });

  it.each([
    ['over 140 characters', 'x'.repeat(141), 'value_too_long'],
    ['health-shaped', 'prefers gentle plans because of my knee injury', 'health_content'],
    ['blank', '   ', 'invalid_value'],
    ['not a string', 42, 'invalid_value'],
    ['missing', undefined, 'invalid_value'],
  ])('400s on a %s value and leaves the row untouched', async (_label, value, reason) => {
    const user = await createUser();
    const row = await mem(user.id);
    const res = await request(await testServer(createApp())).patch(`/me/coach/memory/${row.id}`).set(await authed(user.id)).send({ value });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_memory_value', reason });
    expect((await prisma.coachMemory.findUnique({ where: { id: row.id } }))?.value).toBe('Likes short answers');
  });

  it('accepts exactly 140 characters', async () => {
    const user = await createUser();
    const row = await mem(user.id);
    const res = await request(await testServer(createApp())).patch(`/me/coach/memory/${row.id}`).set(await authed(user.id)).send({ value: 'a'.repeat(140) });
    expect(res.status).toBe(200);
  });

  it('404s for another user\'s entry and for a nonexistent id, changing nothing', async () => {
    const user = await createUser();
    const other = await createUser();
    const theirs = await mem(other.id);
    const a = await request(await testServer(createApp())).patch(`/me/coach/memory/${theirs.id}`).set(await authed(user.id)).send({ value: 'hijack' });
    const b = await request(await testServer(createApp())).patch('/me/coach/memory/does-not-exist').set(await authed(user.id)).send({ value: 'x' });
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect((await prisma.coachMemory.findUnique({ where: { id: theirs.id } }))?.value).toBe('Likes short answers');
  });
});

describe('DELETE /me/coach/memory/:id', () => {
  it('deletes the caller\'s entry with 204', async () => {
    const user = await createUser();
    const row = await mem(user.id);
    const res = await request(await testServer(createApp())).delete(`/me/coach/memory/${row.id}`).set(await authed(user.id));
    expect(res.status).toBe(204);
    expect(await prisma.coachMemory.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it('404s for another user\'s entry (which survives) and for a nonexistent id', async () => {
    const user = await createUser();
    const other = await createUser();
    const theirs = await mem(other.id);
    expect((await request(await testServer(createApp())).delete(`/me/coach/memory/${theirs.id}`).set(await authed(user.id))).status).toBe(404);
    expect((await request(await testServer(createApp())).delete('/me/coach/memory/nope').set(await authed(user.id))).status).toBe(404);
    expect(await prisma.coachMemory.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
});

describe('GET /me/coach/digests/latest', () => {
  const digest = (userId: string, weekStart: string, text: string) =>
    prisma.coachDigest.create({ data: { userId, text, personaId: 'encouraging', weekStart: civilDateToUtcMidnight(weekStart) } });

  it('returns { digest: null } when there is none', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/digests/latest').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ digest: null });
  });

  it('returns the latest week\'s digest as { id, text, createdAt } and never another user\'s', async () => {
    const user = await createUser();
    const other = await createUser();
    await digest(user.id, '2026-09-07', 'older recap');
    const latest = await digest(user.id, '2026-09-14', 'newer recap');
    await digest(other.id, '2026-09-21', 'someone else');

    const res = await request(await testServer(createApp())).get('/me/coach/digests/latest').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.digest).sort()).toEqual(['createdAt', 'id', 'text']);
    expect(res.body.digest).toEqual({ id: latest.id, text: 'newer recap', createdAt: latest.createdAt.toISOString() });
  });

  it('serves a digest stored by an older build without its appended disclaimer (the app shows it as a footnote)', async () => {
    const user = await createUser();
    await digest(user.id, '2026-09-14', `Recovery averaged 70 this week.\n\n${LEGACY_DISCLAIMER}`);
    const res = await request(await testServer(createApp())).get('/me/coach/digests/latest').set(await authed(user.id));
    expect(res.body.digest.text).toBe('Recovery averaged 70 this week.');
  });
});

describe('push token endpoints', () => {
  const token = () => `tok-${Math.random().toString(36).slice(2)}${Date.now()}`;

  it('POST registers a token (204) and is an idempotent upsert', async () => {
    const user = await createUser();
    const t = token();
    const headers = await authed(user.id);
    expect((await request(await testServer(createApp())).post('/me/push-token').set(headers).send({ token: t, platform: 'ios' })).status).toBe(204);
    expect((await request(await testServer(createApp())).post('/me/push-token').set(headers).send({ token: t, platform: 'android' })).status).toBe(204);
    const rows = await prisma.pushToken.findMany({ where: { token: t } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, platform: 'android' });
  });

  // Used to assert the token MOVED to the second caller, which is what let any
  // authenticated user redirect another account's notifications. A shared
  // device now hands the token over explicitly: signing out unregisters it
  // first, and only then can the next account claim it.
  it('a token registered to another account is refused, not moved (409)', async () => {
    const a = await createUser();
    const b = await createUser();
    const t = token();
    await request(await testServer(createApp())).post('/me/push-token').set(await authed(a.id)).send({ token: t, platform: 'ios' });

    const res = await request(await testServer(createApp())).post('/me/push-token').set(await authed(b.id)).send({ token: t, platform: 'ios' });

    expect(res.status).toBe(409);
    const rows = await prisma.pushToken.findMany({ where: { token: t } });
    expect(rows.map((r) => r.userId)).toEqual([a.id]);
  });

  it('the rightful owner can hand the token over by unregistering first', async () => {
    const a = await createUser();
    const b = await createUser();
    const t = token();
    await request(await testServer(createApp())).post('/me/push-token').set(await authed(a.id)).send({ token: t, platform: 'ios' });
    await request(await testServer(createApp())).delete('/me/push-token').set(await authed(a.id)).send({ token: t });

    const res = await request(await testServer(createApp())).post('/me/push-token').set(await authed(b.id)).send({ token: t, platform: 'ios' });

    expect(res.status).toBe(204);
    const rows = await prisma.pushToken.findMany({ where: { token: t } });
    expect(rows.map((r) => r.userId)).toEqual([b.id]);
  });

  it.each([
    ['missing token', { platform: 'ios' }],
    ['empty token', { token: '', platform: 'ios' }],
    ['non-string token', { token: 5, platform: 'ios' }],
    ['token with whitespace', { token: 'a b', platform: 'ios' }],
    ['oversized token', { token: 'x'.repeat(513), platform: 'ios' }],
    ['missing platform', { token: 'abc' }],
    ['unknown platform', { token: 'abc', platform: 'windows' }],
    ['upper-case platform', { token: 'abc', platform: 'IOS' }],
  ])('POST 400s on %s', async (_label, body) => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).post('/me/push-token').set(await authed(user.id)).send(body);
    expect(res.status).toBe(400);
  });

  it('DELETE removes the caller\'s token (204), is idempotent, and never removes another user\'s', async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = token();
    const theirs = token();
    await prisma.pushToken.createMany({
      data: [
        { userId: user.id, token: mine, platform: 'ios' },
        { userId: other.id, token: theirs, platform: 'android' },
      ],
    });
    const headers = await authed(user.id);

    expect((await request(await testServer(createApp())).delete('/me/push-token').set(headers).send({ token: mine })).status).toBe(204);
    expect((await request(await testServer(createApp())).delete('/me/push-token').set(headers).send({ token: mine })).status).toBe(204);
    expect((await request(await testServer(createApp())).delete('/me/push-token').set(headers).send({ token: theirs })).status).toBe(204);

    expect(await prisma.pushToken.count({ where: { token: mine } })).toBe(0);
    expect(await prisma.pushToken.count({ where: { token: theirs } })).toBe(1);
  });

  it('DELETE 400s without a token', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).delete('/me/push-token').set(await authed(user.id)).send({});
    expect(res.status).toBe(400);
  });
});
