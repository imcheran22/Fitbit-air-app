import express from 'express';
import request from 'supertest';
import { RATE_LIMIT_MAX_TURNS, resetTurnGuards } from '../../src/coach/turnGuard';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import { LEGACY_DISCLAIMER } from '../../src/coach/answer/history';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import { LoggerCoachTelemetry } from '../../src/coach/telemetry';
import { ScriptedStreamProvider, StreamStep } from '../../src/coach/model/provider';
import { getCoachProvider, resetCoachProviderFromEnv, resetHostedProviderFromEnv } from '../../src/coach/config';
import { resetWarmState } from '../../src/coach/answer/warm';
import { DEFAULT_PERSONA_ID, RETIRED_CHARACTER_IDS, listPersonas } from '../../src/coach/personas';
import { FakeClock, RecordingTelemetry, createUser, daysAgo, putScore, todayUtc } from './helpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

let savedFlag: string | undefined;
let savedProviderEnv: string | undefined;
let savedHostedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
  // Hermetic: a developer's .env may select a real Ollama model, and GET /status warms the
  // env provider. The unconfigured default has no warm(), so these tests never touch the network.
  savedProviderEnv = process.env.COACH_PROVIDER;
  delete process.env.COACH_PROVIDER;
  resetCoachProviderFromEnv();
  resetWarmState();
  // Hermetic for the hosted engine too: createApp() reads COACH_HOSTED_ENABLED, and no test here builds a real Anthropic client.
  savedHostedFlag = process.env.COACH_HOSTED_ENABLED;
  delete process.env.COACH_HOSTED_ENABLED;
  resetHostedProviderFromEnv();
  jest.spyOn(console, 'info').mockImplementation(() => {}); // default telemetry sink
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  if (savedProviderEnv === undefined) delete process.env.COACH_PROVIDER;
  else process.env.COACH_PROVIDER = savedProviderEnv;
  if (savedHostedFlag === undefined) delete process.env.COACH_HOSTED_ENABLED;
  else process.env.COACH_HOSTED_ENABLED = savedHostedFlag;
  resetCoachProviderFromEnv();
  resetHostedProviderFromEnv();
  resetWarmState();
  jest.restoreAllMocks();
});

async function authed(userId: string) {
  return authHeaderFor(userId);
}

const GOOD = 'Your recovery is 72 today.';

/** An app whose coach runs against a scripted streaming provider and a recording telemetry sink. */
function scriptedApp(script: StreamStep[]) {
  const provider = new ScriptedStreamProvider(script);
  const telemetry = new RecordingTelemetry();
  const app = express();
  app.use(express.json());
  app.use(createCoachRouter({ getProvider: () => provider, telemetry, clock: new FakeClock() }));
  return { app, provider, telemetry };
}

async function consented() {
  const user = await createUser();
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

const ROUTES = [
  ['get', '/me/coach/status'],
  ['post', '/me/coach/consent'],
  ['delete', '/me/coach/consent'],
  ['put', '/me/coach/persona'],
  ['put', '/me/coach/thinking'],
  ['put', '/me/coach/engine'],
  ['get', '/me/coach/today'],
  ['get', '/me/coach/conversations'],
  ['post', '/me/coach/message'],
  ['get', '/me/coach/conversations/latest'],
  ['get', '/me/coach/conversations/some-id'],
] as const;

describe('auth', () => {
  it.each(ROUTES)('%s %s requires a bearer token (flag on)', async (method, path) => {
    expect((await request(await testServer(createApp()))[method](path)).status).toBe(401);
  });

  it.each(ROUTES)('%s %s requires a bearer token (flag off)', async (method, path) => {
    process.env.COACH_ENABLED = 'false';
    expect((await request(await testServer(createApp()))[method](path)).status).toBe(401);
  });
});

describe('COACH_ENABLED flag (default off)', () => {
  it('is off when unset: status says enabled:false', async () => {
    delete process.env.COACH_ENABLED;
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.consented).toBe(false);
  });

  it.each(['false', '0', '', 'yes-please'])('COACH_ENABLED=%j is off', async (value) => {
    process.env.COACH_ENABLED = value;
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.body.enabled).toBe(false);
  });

  // Status, PUT persona and PUT thinking stay open: the character and its thinking style are also the app's look,
  // so they are shown and chosen while the coach is off.
  const OPEN: readonly string[] = ['/me/coach/status', '/me/coach/persona', '/me/coach/thinking'];
  const GATED = ROUTES.filter(([, p]) => !OPEN.includes(p));

  it.each(GATED)('%s %s returns 404 coach_disabled when off', async (method, path) => {
    process.env.COACH_ENABLED = 'false';
    const user = await consented();
    const res = await request(await testServer(createApp()))
      [method](path)
      .set(await authed(user.id))
      .send({ version: COACH_CONSENT_VERSION, personaId: 'direct', message: 'hi' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'coach_disabled' });
  });

  it('never calls the model or persists anything while off', async () => {
    process.env.COACH_ENABLED = 'false';
    const { app, provider } = scriptedApp([GOOD]);
    const user = await consented();
    await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'hi' });
    expect(provider.callCount).toBe(0);
    expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('GET /me/coach/status', () => {
  it('fires no network warm-up in tests (the env provider is the unconfigured default)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const user = await createUser();
    expect((await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id))).status).toBe(200);
    await new Promise((r) => setImmediate(r)); // the warm-up is fire-and-forget
    expect(getCoachProvider().warm).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the contract shape', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'consent',
      'consented',
      'enabled',
      'engine',
      'engines',
      'personaChosen',
      'personaId',
      'personas',
      'thinkingAttachment',
      'thinkingText',
    ]);
    expect(res.body).toMatchObject({ enabled: true, consented: false, personaId: 'mochi', personaChosen: false });
    expect(Object.keys(res.body.consent).sort()).toEqual(['dataItems', 'summary', 'version']);
    expect(res.body.consent.version).toBe(COACH_CONSENT_VERSION);
    expect(Array.isArray(res.body.consent.dataItems)).toBe(true);
    // The contract the mobile picker reads: every character, in picker order, with its copy.
    expect(res.body.personas).toEqual(
      listPersonas().map((p) => ({
        id: p.id,
        name: p.name,
        verbosity: p.verbosity,
        proactivity: p.proactivity,
        tagline: p.tagline ?? null,
        greeting: p.greeting ?? null,
      })),
    );
    expect(res.body.personas).toHaveLength(15);
  });

  it('personaChosen turns true once a persona is stored, and personaId is that persona', async () => {
    const chosen = listPersonas()[1]!.id;
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: chosen } });
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.body).toMatchObject({ personaId: chosen, personaChosen: true });
  });

  // Ruling R24: a stored id that is not live re-opens the picker (defence in depth beside the migration).
  it('an unknown stored id serves the default and does not count as chosen', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'retired-persona' } });
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.body).toMatchObject({ personaId: DEFAULT_PERSONA_ID, personaChosen: false });
  });

  // Ruling R6: a legacy v1 id is unknown, like a retired character, so it reads as the default, Mochi;
  // R24: and the picker opens again.
  it.each(['encouraging', 'direct', 'clinical'])(
    'a legacy %s row (not yet migrated) reads as the default, mochi, and does not count as chosen',
    async (legacy) => {
      const user = await createUser();
      await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: legacy } });
      const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
      expect(res.body).toMatchObject({ personaId: 'mochi', personaChosen: false });
    },
  );

  it('reports the persona while the coach is off, since the character is also the app look', async () => {
    process.env.COACH_ENABLED = 'false';
    const chosen = listPersonas()[1]!.id;
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: chosen } });
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, consented: false, personaId: chosen, personaChosen: true });
    expect(res.body.personas.map((p: { id: string }) => p.id)).toEqual(listPersonas().map((p) => p.id));
  });

  it('a user row that is gone reads as the default and not chosen, rather than a 500', async () => {
    const user = await createUser();
    const headers = await authed(user.id);
    const realFindUnique = prisma.user.findUnique.bind(prisma.user);
    // Only the status handler's own lookup (the one selecting coachPersonaId) sees a missing row; auth is untouched.
    jest
      .spyOn(prisma.user, 'findUnique')
      .mockImplementation(((args: { select?: { coachPersonaId?: boolean } }) =>
        args.select?.coachPersonaId ? Promise.resolve(null) : realFindUnique(args as never)) as never);
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ personaId: DEFAULT_PERSONA_ID, personaChosen: false });
  });

  it('consent text states which fields leave the device and what never does', async () => {
    const user = await createUser();
    const { consent } = (await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id))).body;
    const text = `${consent.summary} ${consent.dataItems.join(' ')}`;
    expect(text).toMatch(/score/i);
    expect(text).toMatch(/factor/i);
    expect(text).toMatch(/habit/i);
    expect(text).toMatch(/goal/i);
    expect(text).toMatch(/never sent[^.]*tokens/i);
    // Version 2: daily readings and habit logs are listed, and notes never leave.
    expect(consent.version).toBe('2');
    expect(text).toMatch(/steps, resting heart rate, HRV and time asleep/i);
    expect(text).toMatch(/habit log/i);
    expect(text).toMatch(/never sent[^.]*notes/i);
  });
});

describe('consent gate', () => {
  it('POST /me/coach/message is 403 consent_required without consent, and the model is never called', async () => {
    const { app, provider } = scriptedApp([GOOD]);
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required' });
    expect(provider.callCount).toBe(0);
    expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
  });

  it('POST consent with the current version grants it (200 {consented:true}) and is idempotent', async () => {
    const user = await createUser();
    const app = createApp();
    const headers = await authed(user.id);
    const first = await request(await testServer(app)).post('/me/coach/consent').set(headers).send({ version: COACH_CONSENT_VERSION });
    const again = await request(await testServer(app)).post('/me/coach/consent').set(headers).send({ version: COACH_CONSENT_VERSION });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ consented: true });
    expect(again.status).toBe(200);
    expect(await prisma.coachConsent.count({ where: { userId: user.id } })).toBe(1);
    const status = await request(await testServer(app)).get('/me/coach/status').set(headers);
    expect(status.body.consented).toBe(true);
  });

  it('POST consent with a stale or unknown version is 409 stale_consent_version and stores nothing', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).post('/me/coach/consent').set(await authed(user.id)).send({ version: '0-old' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'stale_consent_version' });
    expect(await prisma.coachConsent.count({ where: { userId: user.id } })).toBe(0);
    const bad = await request(await testServer(createApp())).post('/me/coach/consent').set(await authed(user.id)).send({});
    expect(bad.status).toBe(400);
  });

  it('a consent to an older version does not satisfy the current one (a version bump requires re-consent)', async () => {
    const { app, provider } = scriptedApp([GOOD]);
    const user = await createUser();
    await prisma.coachConsent.create({ data: { userId: user.id, version: '0-old' } });
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'hi' });
    expect(res.status).toBe(403);
    expect(provider.callCount).toBe(0);
    const status = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(status.body.consented).toBe(false);
  });

  it('DELETE consent revokes it (204) and messages are refused again until re-consent', async () => {
    const { app, provider } = scriptedApp(['Fine.', 'Fine.']);
    const user = await consented();
    const headers = await authed(user.id);
    expect((await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hi' })).status).toBe(200);

    const del = await request(await testServer(createApp())).delete('/me/coach/consent').set(headers);
    expect(del.status).toBe(204);
    expect((await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hi' })).status).toBe(403);
    expect(provider.callCount).toBe(1);

    await request(await testServer(createApp())).post('/me/coach/consent').set(headers).send({ version: COACH_CONSENT_VERSION });
    expect((await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hi' })).status).toBe(200);
    // The audit trail keeps both grants; the first is stamped revoked.
    const rows = await prisma.coachConsent.findMany({ where: { userId: user.id }, orderBy: { consentedAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[1]!.revokedAt).toBeNull();
  });
});

describe('PUT /me/coach/persona', () => {
  it('sets the persona, echoes it, and status reflects it', async () => {
    const user = await createUser();
    const headers = await authed(user.id);
    const res = await request(await testServer(createApp())).put('/me/coach/persona').set(headers).send({ personaId: 'mochi' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ personaId: 'mochi' });
    expect((await request(await testServer(createApp())).get('/me/coach/status').set(headers)).body).toMatchObject({ personaId: 'mochi', personaChosen: true });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.coachPersonaId).toBe('mochi');
  });

  // Ruling R6: a legacy v1 id from a very old app is unknown, so it is refused and nothing is stored.
  it.each(['encouraging', 'direct', 'clinical'])('400 unknown_persona for the legacy id %s, and stores nothing', async (legacy) => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'kit' } });
    const res = await request(await testServer(createApp())).put('/me/coach/persona').set(await authed(user.id)).send({ personaId: legacy });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_persona' });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.coachPersonaId).toBe('kit');
  });

  // Ruling R23: an old build still offers the retired v3 characters, and its Skip sends 'hoot'. The default
  // is saved instead, so that build's picker does not reopen on every launch.
  it.each([...RETIRED_CHARACTER_IDS])('a retired character %s saves the default, mochi (200)', async (retired) => {
    const user = await createUser();
    const headers = await authed(user.id);
    const res = await request(await testServer(createApp())).put('/me/coach/persona').set(headers).send({ personaId: retired });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ personaId: 'mochi' });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.coachPersonaId).toBe('mochi');
    expect((await request(await testServer(createApp())).get('/me/coach/status').set(headers)).body).toMatchObject({ personaId: 'mochi', personaChosen: true });
  });

  it('the retired set is exactly the seven v3 characters v4 dropped', () => {
    expect([...RETIRED_CHARACTER_IDS].sort()).toEqual(['beat', 'beep', 'doze', 'ember', 'hoot', 'nimbus', 'pip']);
  });

  it.each([['false'], [undefined]])('works while the coach is off (COACH_ENABLED=%j)', async (flag) => {
    if (flag === undefined) delete process.env.COACH_ENABLED;
    else process.env.COACH_ENABLED = flag;
    const chosen = listPersonas()[1]!.id;
    const user = await createUser();
    const headers = await authed(user.id);
    const res = await request(await testServer(createApp())).put('/me/coach/persona').set(headers).send({ personaId: chosen });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ personaId: chosen });
    expect((await request(await testServer(createApp())).get('/me/coach/status').set(headers)).body).toMatchObject({
      enabled: false,
      personaId: chosen,
      personaChosen: true,
    });
  });

  it.each([
    [{ personaId: 'pirate' }],
    [{}],
    [{ personaId: 7 }],
    [{ personaId: null }],
    [{ personaId: ['hoot'] }],
    [{ personaId: 'Hoot' }],
    [{ personaId: 'toString' }],
    [{ personaId: '__proto__' }],
  ])('400 for an unknown persona %j', async (body) => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).put('/me/coach/persona').set(await authed(user.id)).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_persona' });
  });

  it('the chosen persona is the one the coach uses on the next turn', async () => {
    const { app, provider, telemetry } = scriptedApp(['Fine.']);
    const user = await consented();
    await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'luna' } });
    await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'hi' });
    expect(provider.requests[0]!.system).toContain('- name: "Luna"');
    expect(provider.requests[0]!.system).toContain('- coaching focus: "Sleep."');
    expect(telemetry.events.every((e) => e.personaId === 'luna')).toBe(true);
  });
});

describe('thinking settings', () => {
  it('returns the defaults in the status until the user picks', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.body).toMatchObject({ thinkingAttachment: 'bulb', thinkingText: 'steps' });
  });

  it('saves either setting on its own and reports both', async () => {
    const user = await createUser();
    const headers = await authed(user.id);
    const app = await testServer(createApp());
    let res = await request(app).put('/me/coach/thinking').set(headers).send({ attachment: 'gears' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ thinkingAttachment: 'gears', thinkingText: 'steps' });
    res = await request(app).put('/me/coach/thinking').set(headers).send({ text: 'dialog' });
    expect(res.body).toEqual({ thinkingAttachment: 'gears', thinkingText: 'dialog' });
    res = await request(app).get('/me/coach/status').set(headers);
    expect(res.body).toMatchObject({ thinkingAttachment: 'gears', thinkingText: 'dialog' });
  });

  it('works while the coach is off, since it is a look', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await createUser();
    const res = await request(await testServer(createApp())).put('/me/coach/thinking').set(await authed(user.id)).send({ attachment: 'cloud', text: 'shimmer' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ thinkingAttachment: 'cloud', thinkingText: 'shimmer' });
  });

  it.each([[{ attachment: 'rocket' }], [{ text: 'mime' }], [{}], [{ attachment: 42 }], [{ text: '__proto__' }], [{ attachment: 'gears', text: 'mime' }]])(
    'rejects %j with 400 unknown_thinking_style and saves nothing',
    async (body) => {
      const user = await createUser();
      const res = await request(await testServer(createApp())).put('/me/coach/thinking').set(await authed(user.id)).send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'unknown_thinking_style' });
      const row = await prisma.user.findUnique({ where: { id: user.id }, select: { coachThinkingAttachment: true, coachThinkingText: true } });
      expect(row).toEqual({ coachThinkingAttachment: null, coachThinkingText: null });
    },
  );

  it('404 when the user row is gone, as PUT /me/coach/persona does, rather than a 500', async () => {
    const user = await createUser();
    const headers = await authed(user.id);
    jest.spyOn(prisma.user, 'updateMany').mockResolvedValue({ count: 0 });
    const res = await request(await testServer(createApp())).put('/me/coach/thinking').set(headers).send({ attachment: 'gears' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  it('treats a stored value the app no longer knows as the default', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { coachThinkingAttachment: 'retired', coachThinkingText: 'retired' } });
    const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
    expect(res.body).toMatchObject({ thinkingAttachment: 'bulb', thinkingText: 'steps' });
  });
});

// Review Focus 1: a retired stored id must never reach any client.
it('reports Mochi for a stored retired character, and never lists a retired id', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'hoot' } });
  const res = await request(await testServer(createApp())).get('/me/coach/status').set(await authed(user.id));
  expect(res.body.personaId).toBe('mochi');
  // Ruling R24: a stored id that is not live re-opens the picker, even before the migration clears it.
  expect(res.body.personaChosen).toBe(false);
  const ids = res.body.personas.map((p: { id: string }) => p.id);
  for (const retired of ['hoot', 'pip', 'nimbus', 'ember', 'beep', 'doze', 'beat']) expect(ids).not.toContain(retired);
});

describe('POST /me/coach/message', () => {
  it('returns the contract shape and persists both messages in order', async () => {
    const { app } = scriptedApp([GOOD]);
    const user = await consented();
    await putScore(user.id, daysAgo(1), 75);
    await putScore(user.id, todayUtc(), 72.4);

    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: '  why is my score low  ' });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['conversationId', 'message']);
    expect(Object.keys(res.body.message).sort()).toEqual(['createdAt', 'id', 'role', 'source', 'text']);
    expect(res.body.message).toMatchObject({
      role: 'assistant',
      source: 'model',
      text: `Your recovery is 72 today.\n\n${LEGACY_DISCLAIMER}`,
    });
    expect(new Date(res.body.message.createdAt).toISOString()).toBe(res.body.message.createdAt);

    const rows = await prisma.coachMessage.findMany({ where: { conversationId: res.body.conversationId }, orderBy: { createdAt: 'asc' } });
    // Stored clean: the disclaimer is added to the older apps' JSON response only (R46).
    expect(rows.map((r) => [r.role, r.source, r.text])).toEqual([
      ['USER', null, 'why is my score low'],
      ['ASSISTANT', 'MODEL', 'Your recovery is 72 today.'],
    ]);
    expect(rows[1]!.id).toBe(res.body.message.id);
    expect(rows.every((r) => r.userId === user.id)).toBe(true);
    const conv = await prisma.coachConversation.findUnique({ where: { id: res.body.conversationId } });
    expect(conv?.userId).toBe(user.id);
    expect(conv!.lastMessageAt.getTime()).toBeGreaterThanOrEqual(rows[1]!.createdAt.getTime());
  });

  it('with the default (unconfigured) provider the answer is a 503 model_unavailable, never a template reply', async () => {
    // A developer's .env may set COACH_PROVIDER=ollama; this case is about the
    // unconfigured default, so it must not depend on the local environment.
    const savedProvider = process.env.COACH_PROVIDER;
    delete process.env.COACH_PROVIDER;
    resetCoachProviderFromEnv();
    try {
      const user = await consented();
      await putScore(user.id, todayUtc(), 66.5);
      const res = await request(await testServer(createApp())).post('/me/coach/message').set(await authed(user.id)).send({ message: 'how am I doing' });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'model_unavailable', retryable: true });
      expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      if (savedProvider === undefined) delete process.env.COACH_PROVIDER;
      else process.env.COACH_PROVIDER = savedProvider;
      resetCoachProviderFromEnv();
    }
  });

  it('continues a conversation with conversationId, feeding prior turns to the model', async () => {
    const { app, provider } = scriptedApp(['First.', 'Second.']);
    const user = await consented();
    const headers = await authed(user.id);
    const one = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hello' });
    const two = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'again', conversationId: one.body.conversationId });
    expect(two.status).toBe(200);
    expect(two.body.conversationId).toBe(one.body.conversationId);
    expect(await prisma.coachMessage.count({ where: { conversationId: one.body.conversationId } })).toBe(4);
    expect(provider.requests[1]!.messages.slice(0, 3)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'First.' },
      { role: 'user', content: 'again' },
    ]);
  });

  it('omitting conversationId starts a new conversation', async () => {
    const { app } = scriptedApp(['A.', 'B.']);
    const user = await consented();
    const headers = await authed(user.id);
    const one = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hello' });
    const two = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'hello' });
    expect(two.body.conversationId).not.toBe(one.body.conversationId);
  });

  it("404s on another user's or an unknown conversationId, without calling the model", async () => {
    const { app, provider } = scriptedApp(['A.', 'B.']);
    const owner = await consented();
    const other = await consented();
    const conv = (await request(await testServer(app)).post('/me/coach/message').set(await authed(owner.id)).send({ message: 'hello' })).body.conversationId;
    const calls = provider.callCount;
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(other.id)).send({ message: 'hi', conversationId: conv });
    expect(res.status).toBe(404);
    expect((await request(await testServer(app)).post('/me/coach/message').set(await authed(other.id)).send({ message: 'hi', conversationId: 'nope' })).status).toBe(404);
    expect(provider.callCount).toBe(calls);
    expect(await prisma.coachMessage.count({ where: { conversationId: conv } })).toBe(2);
  });

  it.each([
    ['missing', {}],
    ['empty', { message: '' }],
    ['whitespace only', { message: '   ' }],
    ['not a string', { message: 5 }],
    ['over 2000 characters', { message: 'x'.repeat(2001) }],
    ['non-string conversationId', { message: 'hi', conversationId: 5 }],
    ['non-boolean safetyOverride', { message: 'hi', safetyOverride: 'yes' }],
  ])('400 for an invalid body: %s', async (_l, body) => {
    const { app, provider } = scriptedApp(['A.']);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send(body);
    expect(res.status).toBe(400);
    expect(provider.callCount).toBe(0);
  });

  it('accepts a message of exactly 2000 characters', async () => {
    const { app } = scriptedApp(['A.']);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'x'.repeat(2000) });
    expect(res.status).toBe(200);
  });

  it('a crisis message gets the fixed safety reply with resources and canContinue, no model call, both messages persisted', async () => {
    const { app, provider } = scriptedApp(['never']);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'I want to end my life' });
    expect(res.status).toBe(200);
    expect(res.body.message.source).toBe('safety');
    expect(res.body.safety.canContinue).toBe(true);
    expect(res.body.safety.resources.length).toBeGreaterThan(0);
    expect(provider.callCount).toBe(0);
    const rows = await prisma.coachMessage.findMany({ where: { conversationId: res.body.conversationId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.source)).toEqual([null, 'SAFETY']);
  });

  it('safetyOverride:true returns control to normal chat for that message', async () => {
    const { app, provider, telemetry } = scriptedApp(['Glad to help with your data.']);
    const user = await consented();
    const res = await request(await testServer(app))
      .post('/me/coach/message')
      .set(await authed(user.id))
      .send({ message: 'should I take melatonin', safetyOverride: true });
    expect(res.status).toBe(200);
    expect(res.body.message.source).toBe('model');
    expect(res.body.safety).toBeUndefined();
    expect(provider.callCount).toBe(1);
    expect(telemetry.named('coach.safety_classifier')[0]!.attributes).toMatchObject({ overridden: true });
  });

  it('persists guardrail events on the assistant message when a reply was rejected then regenerated', async () => {
    const { app } = scriptedApp(['Here are 3 tips.', 'Rest well.']);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: 'tips?' });
    const assistant = await prisma.coachMessage.findUnique({ where: { id: res.body.message.id } });
    expect(assistant?.guardrailEvents).toEqual([{ type: 'sentence_dropped', reason: 'unknown_number', attempt: 1 }, { type: 'regenerated' }]);
  });

  it('never writes message text or fact values to the logs', async () => {
    const SENTINEL = 'quokka-sentinel-question';
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    const provider = new ScriptedStreamProvider(['Take 3 naps.', `Still ${SENTINEL}. Your recovery is 71.`]);
    const app = express();
    app.use(express.json());
    app.use(createCoachRouter({ getProvider: () => provider, telemetry: new LoggerCoachTelemetry(), clock: new FakeClock() }));
    const user = await consented();
    await putScore(user.id, todayUtc(), 71.1);
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authed(user.id)).send({ message: `${SENTINEL} why` });
    expect(res.status).toBe(200);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.join(' '))).join('\n');
    expect(logged).toContain('coach.answer_done'); // logging is on...
    expect(logged).toContain(user.id);
    expect(logged).not.toContain(SENTINEL); // ...but carries ids/counts/reasons only
    expect(logged).not.toContain('recovery is'); // no reply text (a bare "71" could appear inside a uuid)
    expect(logged).not.toContain('naps');
  });
});

describe('conversation transcripts', () => {
  it('GET /latest returns { conversationId: null, messages: [] } when there is none', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/coach/conversations/latest').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversationId: null, messages: [] });
  });

  it('GET /latest and GET /:id return the transcript in order with the contract shape', async () => {
    const { app } = scriptedApp(['A.', 'B.']);
    const user = await consented();
    const headers = await authed(user.id);
    const first = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'one' });
    const second = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'two' });

    const latest = await request(await testServer(createApp())).get('/me/coach/conversations/latest').set(headers);
    expect(latest.status).toBe(200);
    expect(latest.body.conversationId).toBe(second.body.conversationId);
    expect(latest.body.messages).toHaveLength(2);
    expect(Object.keys(latest.body.messages[0]).sort()).toEqual([
      'card', 'createdAt', 'engine', 'id', 'memoryProposals', 'role', 'safety', 'source', 'stopped', 'text',
    ]);
    expect(latest.body.messages.map((m: any) => [m.role, m.source])).toEqual([
      ['user', null],
      ['assistant', 'model'],
    ]);
    expect(latest.body.messages[0].text).toBe('two');

    const byId = await request(await testServer(createApp())).get(`/me/coach/conversations/${first.body.conversationId}`).set(headers);
    expect(byId.status).toBe(200);
    expect(byId.body.conversationId).toBe(first.body.conversationId);
    expect(byId.body.messages[0].text).toBe('one');
  });

  it("GET /:id is 404 for another user's conversation and for an unknown id", async () => {
    const { app } = scriptedApp(['A.']);
    const owner = await consented();
    const other = await createUser();
    const conv = (await request(await testServer(app)).post('/me/coach/message').set(await authed(owner.id)).send({ message: 'private' })).body.conversationId;
    const stolen = await request(await testServer(createApp())).get(`/me/coach/conversations/${conv}`).set(await authed(other.id));
    expect(stolen.status).toBe(404);
    expect(JSON.stringify(stolen.body)).not.toContain('private');
    expect((await request(await testServer(createApp())).get('/me/coach/conversations/unknown-id').set(await authed(other.id))).status).toBe(404);
    // Latest never leaks across users either.
    const latest = await request(await testServer(createApp())).get('/me/coach/conversations/latest').set(await authed(other.id));
    expect(latest.body.conversationId).toBeNull();
  });
});

describe('POST /me/coach/message: per-user guards', () => {
  // A coach turn can hold a synthesis-tier loop open for 60s and, once a real
  // provider is wired, costs money every time. The endpoint had nothing in
  // front of it.
  it('rate limits a burst and says when to retry', async () => {
    resetTurnGuards();
    const { app } = scriptedApp(Array.from({ length: RATE_LIMIT_MAX_TURNS + 1 }, () => 'Fine.'));
    const user = await consented();
    const headers = await authed(user.id);

    for (let i = 0; i < RATE_LIMIT_MAX_TURNS; i++) {
      const ok = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: `hello ${i}` });
      expect(ok.status).toBe(200);
    }

    const limited = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'one too many' });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('too_many_messages');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not spend a rate-limit slot on a request that fails validation', async () => {
    resetTurnGuards();
    const { app } = scriptedApp(['Fine.']);
    const user = await consented();
    const headers = await authed(user.id);

    for (let i = 0; i < RATE_LIMIT_MAX_TURNS + 3; i++) {
      const bad = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: '' });
      expect(bad.status).toBe(400);
    }

    const ok = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'still allowed' });
    expect(ok.status).toBe(200);
  });
});
