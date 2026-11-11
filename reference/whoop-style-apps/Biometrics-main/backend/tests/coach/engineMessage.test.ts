// backend/tests/coach/engineMessage.test.ts
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import { COACH_CONSENT_VERSION, COACH_HOSTED_CONSENT_VERSION } from '../../src/coach/consent';
import { HostedRefusalError } from '../../src/coach/model/anthropic';
import type { CoachModelProvider, CoachStreamRequest } from '../../src/coach/model/provider';
import { resetTurnGuards } from '../../src/coach/turnGuard';
import { resetWarmState } from '../../src/coach/answer/warm';
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
  resetTurnGuards();
  resetWarmState();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  jest.restoreAllMocks();
});

const ANSWER = 'Keep a steady bedtime. Dim the lights an hour before bed.';

function fake(id: string, opts: { failWith?: Error; warm?: () => Promise<void> } = {}) {
  const requests: CoachStreamRequest[] = [];
  const provider: CoachModelProvider & { requests: CoachStreamRequest[] } = {
    id,
    requests,
    ...(opts.warm ? { warm: opts.warm } : {}),
    async *stream(req: CoachStreamRequest) {
      requests.push(req);
      if (opts.failWith) throw opts.failWith;
      yield ANSWER;
    },
  };
  return provider;
}

function appWith(local: CoachModelProvider, hosted: CoachModelProvider | null) {
  const telemetry = new RecordingTelemetry();
  const a = express();
  a.use(express.json());
  a.use(createCoachRouter({ getProvider: () => local, getHostedProvider: () => hosted, telemetry, clock: new FakeClock() }));
  return { app: a, telemetry };
}

async function userOn(engine: 'LOCAL' | 'HOSTED') {
  const user = await createUser();
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
  await prisma.user.update({ where: { id: user.id }, data: { coachEngine: engine } });
  return user;
}

/** Parses an SSE body into [event, data] pairs. */
function sse(text: string): Array<{ event: string; data: any }> {
  return text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)![1]!;
      const data = JSON.parse(/^data: (.+)$/m.exec(block)![1]!);
      return { event, data };
    });
}

async function ask(app: express.Express, userId: string) {
  const res = await request(await testServer(app))
    .post('/me/coach/message')
    .set(await authHeaderFor(userId))
    .set('Accept', 'text/event-stream')
    .send({ message: 'What is a good bedtime routine?' });
  expect(res.status).toBe(200);
  const events = sse(res.text);
  const done = events.find((e) => e.event === 'done')!.data;
  const stored = await prisma.coachMessage.findUniqueOrThrow({ where: { id: done.messageId } });
  return { events, done, stored };
}

describe('POST /me/coach/message engine selection', () => {
  it('a user on the local engine is answered locally; the hosted model is never called', async () => {
    const local = fake('local');
    const hosted = fake('hosted');
    const user = await userOn('LOCAL');
    const { done, stored } = await ask(appWith(local, hosted).app, user.id);
    expect(done.engine).toBe('local');
    expect(stored.engine).toBe('LOCAL');
    expect(hosted.requests).toHaveLength(0);
    expect(local.requests).toHaveLength(1);
  });

  it('a user on the hosted engine is answered by the hosted model', async () => {
    const local = fake('local');
    const hosted = fake('hosted');
    const user = await userOn('HOSTED');
    const { events, done, stored } = await ask(appWith(local, hosted).app, user.id);
    expect(done.engine).toBe('hosted');
    expect(stored.engine).toBe('HOSTED');
    expect(hosted.requests).toHaveLength(1);
    expect(local.requests).toHaveLength(0);
    expect(events.filter((e) => e.event === 'text').map((e) => e.data.sentence).join(' ')).toBe(ANSWER);
    // The hosted path names the new conversation up front too.
    expect(events.find((e) => e.event === 'status')!.data.conversationId).toBe(done.conversationId);
  });

  it('a failed hosted call is answered locally, reported as local, and logged by error name only', async () => {
    const local = fake('local');
    const hosted = fake('hosted', { failWith: new HostedRefusalError() });
    const user = await userOn('HOSTED');
    const { app, telemetry } = appWith(local, hosted);

    const { events, done, stored } = await ask(app, user.id);

    expect(done.engine).toBe('local');
    expect(stored.engine).toBe('LOCAL');
    expect(events.some((e) => e.event === 'error')).toBe(false);
    expect(local.requests).toHaveLength(1);
    expect(telemetry.named('coach.hosted_fallback')).toEqual([
      { name: 'coach.hosted_fallback', userId: user.id, personaId: 'none', attributes: { error: 'HostedRefusalError' } },
    ]);
    expect(telemetry.named('coach.answer_done').map((e) => e.attributes.engine)).toEqual(['local']);
  });

  it('stores the served engine with the reply: no correction write after it', async () => {
    const local = fake('local');
    const hosted = fake('hosted', { failWith: new HostedRefusalError() });
    const user = await userOn('HOSTED');
    const updates = jest.spyOn(prisma.coachMessage, 'updateMany');

    const { done, stored } = await ask(appWith(local, hosted).app, user.id);

    expect(done.engine).toBe('local');
    expect(stored.engine).toBe('LOCAL');
    expect(updates).not.toHaveBeenCalled();
  });

  it('warms the local model when a message goes to the hosted engine, so a fallback finds it loaded', async () => {
    const warm = jest.fn(async () => {});
    const user = await userOn('HOSTED');
    await ask(appWith(fake('local', { warm }), fake('hosted')).app, user.id);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('does not warm from the message route for a user on the local engine', async () => {
    const warm = jest.fn(async () => {});
    const user = await userOn('LOCAL');
    await ask(appWith(fake('local', { warm }), fake('hosted')).app, user.id);
    expect(warm).not.toHaveBeenCalled();
  });

  it('answers locally when hosted is chosen but switched off', async () => {
    const local = fake('local');
    const user = await userOn('HOSTED');
    const { done } = await ask(appWith(local, null).app, user.id);
    expect(done.engine).toBe('local');
    expect(local.requests).toHaveLength(1);
  });

  it('the JSON path (older apps) also falls back to local and stores the served engine', async () => {
    const local = fake('local');
    const hosted = fake('hosted', { failWith: new HostedRefusalError() });
    const user = await userOn('HOSTED');
    const { app, telemetry } = appWith(local, hosted);

    const res = await request(await testServer(app))
      .post('/me/coach/message')
      .set(await authHeaderFor(user.id))
      .send({ message: 'What is a good bedtime routine?' });

    expect(res.status).toBe(200);
    expect(res.body.message.text).toContain(ANSWER);
    const stored = await prisma.coachMessage.findUniqueOrThrow({ where: { id: res.body.message.id } });
    expect(stored.engine).toBe('LOCAL');
    expect(telemetry.named('coach.hosted_fallback')).toHaveLength(1);
  });
});
