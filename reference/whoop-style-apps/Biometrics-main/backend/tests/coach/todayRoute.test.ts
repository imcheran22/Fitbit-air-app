import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import { COACH_CONSENT_VERSION, COACH_HOSTED_CONSENT_VERSION } from '../../src/coach/consent';
import type { FactSheet } from '../../src/coach/answer/facts';
import { templateSentence } from '../../src/coach/answer/today';
import type { CoachModelProvider, CoachStreamRequest } from '../../src/coach/model/provider';
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

const NOW = new Date('2026-09-30T12:00:00Z');
const LOW_DAY: FactSheet = {
  route: 'today',
  facts: [
    { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
    { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52 },
  ],
  notes: [],
};
const EMPTY: FactSheet = { route: 'today', facts: [], notes: [] };
const GOOD = 'Recovery sits at 26 after HRV dipped to 41 ms. Keep today gentle.';

function fake(id: string) {
  const requests: CoachStreamRequest[] = [];
  const provider: CoachModelProvider & { requests: CoachStreamRequest[] } = {
    id,
    requests,
    async *stream(req: CoachStreamRequest) {
      requests.push(req);
      yield GOOD;
    },
  };
  return provider;
}

function setup(opts: { sheet?: FactSheet; hosted?: CoachModelProvider | null } = {}) {
  const local = fake('local');
  const tasks: Array<() => Promise<unknown>> = [];
  const a = express();
  a.use(express.json());
  a.use(
    createCoachRouter({
      getProvider: () => local,
      getHostedProvider: () => opts.hosted ?? null,
      telemetry: new RecordingTelemetry(),
      clock: new FakeClock(),
      today: { loadSheet: async () => opts.sheet ?? LOW_DAY, now: () => NOW },
      background: (task) => {
        tasks.push(task);
      },
    }),
  );
  const runTasks = async () => {
    while (tasks.length > 0) await tasks.shift()!();
  };
  return { app: a, local, tasks, runTasks };
}

async function consentedUser() {
  const user = await createUser();
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

describe('GET /me/coach/today', () => {
  it('returns the empty state before any data, and schedules nothing', async () => {
    const user = await consentedUser();
    const { app, tasks } = setup({ sheet: EMPTY });
    const res = await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: '2026-09-30', hasData: false, sentence: null, bars: [] });
    expect(tasks).toHaveLength(0);
  });

  it('answers with the template at once, writes the AI sentence in the background, then serves it', async () => {
    const user = await consentedUser();
    const { app, local, tasks, runTasks } = setup();

    const first = await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(first.status).toBe(200);
    expect(first.body.hasData).toBe(true);
    expect(first.body.sentence).toEqual({ ...templateSentence(LOW_DAY), source: 'template' });
    expect(first.body.bars.map((b: { metric: string }) => b.metric)).toEqual(['recovery', 'hrv']);
    expect(first.body.bars[0]).toMatchObject({ value: 26, usual: 58, status: 'below', scaleMax: 100, usualDisplay: '58' });
    expect(tasks).toHaveLength(1);
    expect(local.requests).toHaveLength(0); // nothing waited on the model

    await runTasks();
    expect(local.requests).toHaveLength(1);

    const second = await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(second.body.sentence).toMatchObject({ text: GOOD, source: 'ai' });
    expect(tasks).toHaveLength(0);
  });

  it('shows bars and the template without the coach consent, but never calls a model', async () => {
    const user = await createUser();
    const { app, local, tasks } = setup();
    const res = await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.sentence.source).toBe('template');
    expect(tasks).toHaveLength(0); // no run is even scheduled: it could never write anything
    expect(local.requests).toHaveLength(0);
    expect(await prisma.coachDaySummary.count({ where: { userId: user.id } })).toBe(0);
  });

  it('is never cached: private, no-store', async () => {
    const user = await consentedUser();
    const res = await request(await testServer(setup().app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('schedules nothing when a TEMPLATE marker is already stored for today, and serves a fresh template', async () => {
    const user = await consentedUser();
    await prisma.coachDaySummary.create({
      data: { userId: user.id, date: civilDateToUtcMidnight('2026-09-30'), text: 'Recovery 99, stale.', spans: [], source: 'TEMPLATE' },
    });
    const { app, tasks } = setup();
    const res = await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.sentence).toEqual({ ...templateSentence(LOW_DAY), source: 'template' });
    expect(tasks).toHaveLength(0);
  });

  it("writes the sentence with the user's hosted engine when chosen", async () => {
    const user = await consentedUser();
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
    await prisma.user.update({ where: { id: user.id }, data: { coachEngine: 'HOSTED' } });
    const hosted = fake('hosted');
    const { app, local, runTasks } = setup({ hosted });

    await request(await testServer(app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    await runTasks();

    expect(hosted.requests).toHaveLength(1);
    expect(local.requests).toHaveLength(0);
  });

  it('404s coach_disabled while the coach is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await consentedUser();
    const res = await request(await testServer(setup().app)).get('/me/coach/today').set(await authHeaderFor(user.id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'coach_disabled' });
  });
});
