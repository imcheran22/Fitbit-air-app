import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { createCoachRouter } from '../../src/coach/routes';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import type { FactSheet } from '../../src/coach/answer/facts';
import type { CoachModelProvider, CoachStreamRequest } from '../../src/coach/model/provider';
import { FakeClock, RecordingTelemetry, createUser } from './helpers';

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
const DAY = civilDateToUtcMidnight('2026-09-30');
const SHEET: FactSheet = {
  route: 'today',
  facts: [{ id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 }],
  notes: [],
};
const NEW_VOICE = 'Recovery is 26, so we go easy and still move. Short walk, early night.';

function setup(today: { now?: () => Date } = {}) {
  const requests: CoachStreamRequest[] = [];
  const local: CoachModelProvider = {
    id: 'local',
    async *stream(req: CoachStreamRequest) {
      requests.push(req);
      yield NEW_VOICE;
    },
  };
  const tasks: Array<() => Promise<unknown>> = [];
  const a = express();
  a.use(express.json());
  a.use(
    createCoachRouter({
      getProvider: () => local,
      getHostedProvider: () => null,
      telemetry: new RecordingTelemetry(),
      clock: new FakeClock(),
      today: { loadSheet: async () => SHEET, now: () => NOW, ...today },
      background: (task) => {
        tasks.push(task);
      },
    }),
  );
  return { app: a, requests, tasks };
}

async function userWithSummary(personaId: string | null, { consented = true } = {}) {
  const user = await createUser();
  if (personaId !== null) await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: personaId } });
  if (consented) await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  await prisma.coachDaySummary.create({
    data: { userId: user.id, date: DAY, text: 'Old voice.', spans: [{ text: 'Old voice.' }], source: 'AI' },
  });
  return user;
}

const rowOf = (userId: string) => prisma.coachDaySummary.findUnique({ where: { userId_date: { userId, date: DAY } } });

async function choose(app: express.Express, userId: string, personaId: string) {
  return request(await testServer(app))
    .put('/me/coach/persona')
    .set(await authHeaderFor(userId))
    .send({ personaId });
}

describe('PUT /me/coach/persona and the day summary', () => {
  it("drops today's sentence and rewrites it in the new character's voice", async () => {
    const user = await userWithSummary('mochi');
    const { app, requests, tasks } = setup();

    const res = await choose(app, user.id, 'kit');

    expect(res.status).toBe(200);
    expect(await rowOf(user.id)).toBeNull(); // the page shows the template until the new sentence exists
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    expect(requests[0]!.system).toContain('"Kit"');
    expect(await rowOf(user.id)).toMatchObject({ text: NEW_VOICE, source: 'AI' });
  });

  it.each([
    ['the same character again', 'kit', 'kit'],
    ['the default character when none was stored (null already means Mochi)', null, 'mochi'],
    ['the default character when the stored id is retired (it already reads as Mochi)', 'hoot', 'mochi'],
  ])('keeps the sentence for %s', async (_label, stored, chosen) => {
    const user = await userWithSummary(stored);
    const { app, tasks } = setup();
    const res = await choose(app, user.id, chosen);
    expect(res.status).toBe(200);
    expect(await rowOf(user.id)).toMatchObject({ text: 'Old voice.' });
    expect(tasks).toHaveLength(0);
  });

  it('still drops the stale sentence but schedules no model call while the coach is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await userWithSummary('mochi');
    const { app, tasks } = setup();
    const res = await choose(app, user.id, 'kit');
    expect(res.status).toBe(200);
    expect(await rowOf(user.id)).toBeNull();
    expect(tasks).toHaveLength(0);
  });

  it('answers 200 for a saved switch even when dropping the old sentence fails, and logs it', async () => {
    const user = await userWithSummary('mochi');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app, tasks } = setup({
      now: () => {
        throw new Error('clock unavailable');
      },
    });

    const res = await choose(app, user.id, 'kit');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ personaId: 'kit' });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { coachPersonaId: true } });
    expect(saved.coachPersonaId).toBe('kit');
    expect(tasks).toHaveLength(0);
    expect(errors).toHaveBeenCalledWith(JSON.stringify({ event: 'coach.request_failed', where: 'persona_summary', error: 'Error' }));
  });

  it('still drops the stale sentence but schedules no model call without the coach consent', async () => {
    const user = await userWithSummary('mochi', { consented: false });
    const { app, tasks } = setup();
    const res = await choose(app, user.id, 'kit');
    expect(res.status).toBe(200);
    expect(await rowOf(user.id)).toBeNull();
    expect(tasks).toHaveLength(0);
  });
});
