import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import {
  COACH_CONSENT_VERSION,
  COACH_HOSTED_CONSENT,
  COACH_HOSTED_CONSENT_VERSION,
  hasCurrentConsent,
} from '../../src/coach/consent';
import type { CoachModelProvider } from '../../src/coach/model/provider';
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

/** A provider that must never be called by these routes. */
const inert = (id: string): CoachModelProvider => ({
  id,
  // eslint-disable-next-line require-yield
  stream: async function* () {
    throw new Error(`${id} called`);
  },
});

function app(opts: { hosted: boolean }) {
  const a = express();
  a.use(express.json());
  a.use(
    createCoachRouter({
      getProvider: () => inert('local'),
      getHostedProvider: () => (opts.hosted ? inert('hosted') : null),
      telemetry: new RecordingTelemetry(),
      clock: new FakeClock(),
    }),
  );
  return a;
}

async function userWith(opts: { local?: boolean; hosted?: boolean; engine?: 'LOCAL' | 'HOSTED' } = {}) {
  const user = await createUser();
  if (opts.local) await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  if (opts.hosted) {
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
  }
  if (opts.engine) await prisma.user.update({ where: { id: user.id }, data: { coachEngine: opts.engine } });
  return user;
}

const engineOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coachEngine: true } })).coachEngine;

describe('GET /me/coach/status: engine fields', () => {
  it('reports the local engine and an unavailable hosted engine by default', async () => {
    const user = await userWith({ local: true });
    const res = await request(await testServer(app({ hosted: false }))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.engine).toBe('local');
    expect(res.body.engines).toEqual({
      hosted: {
        available: false,
        consented: false,
        consent: {
          version: COACH_HOSTED_CONSENT.version,
          summary: COACH_HOSTED_CONSENT.summary,
          dataItems: COACH_HOSTED_CONSENT.dataItems,
        },
      },
    });
  });

  it('reports hosted when chosen, offered and consented', async () => {
    const user = await userWith({ local: true, hosted: true, engine: 'HOSTED' });
    const res = await request(await testServer(app({ hosted: true }))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.body.engine).toBe('hosted');
    expect(res.body.engines.hosted).toMatchObject({ available: true, consented: true });
  });

  it.each([
    ['the hosted engine is switched off', { hosted: false }, { local: true, hosted: true, engine: 'HOSTED' as const }],
    ['the hosted consent is missing', { hosted: true }, { local: true, engine: 'HOSTED' as const }],
  ])('reports local when %s, whatever is stored', async (_label, appOpts, userOpts) => {
    const user = await userWith(userOpts);
    const res = await request(await testServer(app(appOpts))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.body.engine).toBe('local');
  });

  it('reports local when the coach consent is stale, even with a current hosted consent', async () => {
    const user = await userWith({ hosted: true, engine: 'HOSTED' });
    await prisma.coachConsent.create({ data: { userId: user.id, version: '1' } });
    const res = await request(await testServer(app({ hosted: true }))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.consented).toBe(false);
    expect(res.body.engines.hosted).toMatchObject({ available: true, consented: true });
    expect(res.body.engine).toBe('local');
  });

  it('says nothing is available while the coach flag is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await userWith({ local: true, hosted: true, engine: 'HOSTED' });
    const res = await request(await testServer(app({ hosted: true }))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.body.engine).toBe('local');
    expect(res.body.engines.hosted).toMatchObject({ available: false, consented: false });
  });
});

describe('POST /me/coach/consent with a scope', () => {
  it('grants the hosted scope with the hosted version', async () => {
    const user = await userWith({ local: true });
    const res = await request(await testServer(app({ hosted: true })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_HOSTED_CONSENT_VERSION, scope: 'hosted' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ consented: true });
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(true);
    expect(await hasCurrentConsent(user.id)).toBe(true);
  });

  it('409s the local version sent for the hosted scope, and the other way round', async () => {
    const user = await userWith({ local: true });
    const h = await request(await testServer(app({ hosted: true })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_CONSENT_VERSION, scope: 'hosted' });
    expect(h.status).toBe(409);
    expect(h.body).toEqual({ error: 'stale_consent_version' });

    const l = await request(await testServer(app({ hosted: true })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_HOSTED_CONSENT_VERSION });
    expect(l.status).toBe(409);
  });

  it('400s an unknown scope', async () => {
    const user = await userWith({ local: true });
    const res = await request(await testServer(app({ hosted: true })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_HOSTED_CONSENT_VERSION, scope: 'cloud' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "scope must be 'local' or 'hosted'" });
  });

  it('404s a hosted grant while the hosted engine is not offered', async () => {
    const user = await userWith({ local: true });
    const res = await request(await testServer(app({ hosted: false })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_HOSTED_CONSENT_VERSION, scope: 'hosted' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'hosted_unavailable' });
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
  });

  it('403s a hosted grant from a user without the coach consent', async () => {
    const user = await userWith();
    const res = await request(await testServer(app({ hosted: true })))
      .post('/me/coach/consent')
      .set(await authHeaderFor(user.id))
      .send({ version: COACH_HOSTED_CONSENT_VERSION, scope: 'hosted' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required' });
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
  });
});

describe('DELETE /me/coach/consent?scope=hosted', () => {
  it('revokes only the hosted scope and resets the engine to local', async () => {
    const user = await userWith({ local: true, hosted: true, engine: 'HOSTED' });
    const res = await request(await testServer(app({ hosted: true }))).delete('/me/coach/consent?scope=hosted').set(await authHeaderFor(user.id));
    expect(res.status).toBe(204);
    expect(await hasCurrentConsent(user.id)).toBe(true);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('without a scope revokes both and resets the engine', async () => {
    const user = await userWith({ local: true, hosted: true, engine: 'HOSTED' });
    const res = await request(await testServer(app({ hosted: true }))).delete('/me/coach/consent').set(await authHeaderFor(user.id));
    expect(res.status).toBe(204);
    expect(await hasCurrentConsent(user.id)).toBe(false);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(false);
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('400s any other scope and revokes nothing', async () => {
    const user = await userWith({ local: true, hosted: true });
    const res = await request(await testServer(app({ hosted: true }))).delete('/me/coach/consent?scope=local').set(await authHeaderFor(user.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "scope must be 'hosted' when given" });
    expect(await hasCurrentConsent(user.id)).toBe(true);
    expect(await hasCurrentConsent(user.id, 'hosted')).toBe(true);
  });
});

describe('PUT /me/coach/engine', () => {
  it('switches to hosted with both consents while offered', async () => {
    const user = await userWith({ local: true, hosted: true });
    const res = await request(await testServer(app({ hosted: true }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'hosted' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ engine: 'hosted' });
    expect(await engineOf(user.id)).toBe('HOSTED');
  });

  it('switches back to local without any consent check', async () => {
    const user = await userWith({ engine: 'HOSTED' });
    const res = await request(await testServer(app({ hosted: false }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ engine: 'local' });
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('403s hosted without a current hosted consent', async () => {
    const user = await userWith({ local: true });
    const res = await request(await testServer(app({ hosted: true }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'hosted' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required' });
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('403s hosted when only the hosted consent is held (the coach consent was withdrawn)', async () => {
    const user = await userWith({ hosted: true });
    const res = await request(await testServer(app({ hosted: true }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'hosted' });
    expect(res.status).toBe(403);
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it('404s hosted while it is not offered, before looking at consent', async () => {
    const user = await userWith({ local: true, hosted: true });
    const res = await request(await testServer(app({ hosted: false }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'hosted' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'hosted_unavailable' });
    expect(await engineOf(user.id)).toBe('LOCAL');
  });

  it.each([[{}], [{ engine: 'HOSTED' }], [{ engine: 'cloud' }], [{ engine: 1 }]])('400s body %j', async (body) => {
    const user = await userWith({ local: true, hosted: true });
    const res = await request(await testServer(app({ hosted: true }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "engine must be 'local' or 'hosted'" });
  });

  it('404s coach_disabled while the coach flag is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await userWith({ local: true, hosted: true });
    const res = await request(await testServer(app({ hosted: true }))).put('/me/coach/engine').set(await authHeaderFor(user.id)).send({ engine: 'hosted' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'coach_disabled' });
  });
});
