import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { createCoachRouter } from '../../src/coach/routes';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import { LEGACY_DISCLAIMER, LEGACY_REPLY_NOTES } from '../../src/coach/answer/history';
import { CoachModelProvider, CoachStreamRequest, ScriptedStreamProvider, StreamStep, UnconfiguredProvider } from '../../src/coach/model/provider';
import { resetWarmState } from '../../src/coach/answer/warm';
import { resetTurnGuards } from '../../src/coach/turnGuard';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { FakeClock, RecordingTelemetry, createUser, putScore, todayUtc } from './helpers';
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

function appWith(provider: CoachModelProvider) {
  const app = express();
  app.use(express.json());
  app.use(createCoachRouter({ getProvider: () => provider, telemetry: new RecordingTelemetry(), clock: new FakeClock() }));
  return app;
}

function scripted(script: StreamStep[]) {
  const provider = new ScriptedStreamProvider(script);
  return { provider, app: appWith(provider) };
}

async function consented() {
  const user = await createUser();
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

interface SseEvent {
  event: string;
  data: any;
}

/** Parses a full text/event-stream body into its events. */
function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((l) => l.startsWith('event: '))!.slice('event: '.length);
      const data = JSON.parse(lines.find((l) => l.startsWith('data: '))!.slice('data: '.length));
      return { event, data };
    });
}

async function postSse(app: express.Express, headers: Record<string, string>, body: object) {
  return request(await testServer(app))
    .post('/me/coach/message')
    .set(headers)
    .set('Accept', 'text/event-stream')
    .send(body)
    .buffer(true)
    .parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (data += c));
      res.on('end', () => cb(null, data));
    });
}

const CARD = '```card\n{"headline":"Recovery is steady","tiles":[{"fact":"recovery.today","label":"Recovery"}],"source":"Today"}\n```';

describe('POST /me/coach/message with Accept: text/event-stream', () => {
  it('streams status, text, card and done as SSE events and stores the clean reply with its card', async () => {
    const { app } = scripted([['Your recovery is 72 ', 'today. Nice work.\n', CARD]]);
    const user = await consented();
    await putScore(user.id, todayUtc(), 72.4);

    const res = await postSse(app, await authHeaderFor(user.id), { message: 'How am I doing today?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(['status', 'status', 'status', 'text', 'text', 'card', 'done']);
    expect(events.slice(0, 3).map((e) => e.data.step)).toEqual(['route', 'facts', 'write']);
    for (const e of events) expect(e.data.type).toBe(e.event);
    expect(events.filter((e) => e.event === 'text').map((e) => e.data.sentence)).toEqual(['Your recovery is 72 today.', 'Nice work.']);
    expect(events[5]!.data.card.tiles[0]).toMatchObject({ factId: 'recovery.today', display: '72' });
    const done = events[6]!.data;
    expect(done).toMatchObject({ engine: 'local', durationMs: expect.any(Number) });
    // A new chat's id is on the first status event, before anything is stored.
    expect(events[0]!.data.conversationId).toBe(done.conversationId);

    const row = await prisma.coachMessage.findUniqueOrThrow({ where: { id: done.messageId } });
    expect(row).toMatchObject({ conversationId: done.conversationId, text: 'Your recovery is 72 today. Nice work.', engine: 'LOCAL' });
    expect(row.card).toEqual(events[5]!.data.card);
  });

  it('streams the safety card for a crisis message', async () => {
    const { app, provider } = scripted([]);
    const user = await consented();
    const events = parseSse((await postSse(app, await authHeaderFor(user.id), { message: 'I want to end my life' })).body);
    expect(events.map((e) => e.event)).toEqual(['safety', 'done']);
    expect(events[0]!.data.resources.length).toBeGreaterThan(0);
    expect(events[0]!.data.conversationId).toBe(events[1]!.data.conversationId);
    expect(provider.callCount).toBe(0);
  });

  it('streams an error event (still HTTP 200) when the model is unavailable', async () => {
    const app = appWith(new UnconfiguredProvider());
    const user = await consented();
    const res = await postSse(app, await authHeaderFor(user.id), { message: 'How did I sleep?' });
    expect(res.status).toBe(200);
    const events = parseSse(res.body).map((e) => e.data);
    expect(events).toEqual([
      { type: 'status', step: 'route', label: 'Looking at your sleep…', conversationId: expect.any(String) },
      { type: 'status', step: 'facts', label: 'Going through your recent nights…', conversationId: expect.any(String) },
      { type: 'status', step: 'write', label: 'Writing it up…', conversationId: expect.any(String) },
      { type: 'error', code: 'model_unavailable', retryable: true },
    ]);
    // Nothing was stored, so the reserved id was never created: no empty conversation, and
    // a client that sends it back gets conversation_not_found (and starts afresh).
    expect(await prisma.coachConversation.count({ where: { userId: user.id } })).toBe(0);
    const again = await request(await testServer(app))
      .post('/me/coach/message')
      .set(await authHeaderFor(user.id))
      .send({ message: 'How did I sleep?', conversationId: events[0]!.conversationId });
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'conversation_not_found' });
  });

  it('keeps an existing conversation id on the status event', async () => {
    const { app } = scripted([['First.'], ['Second.']]);
    const user = await consented();
    const headers = await authHeaderFor(user.id);
    const first = parseSse((await postSse(app, headers, { message: 'How am I doing today?' })).body);
    const conversationId = first[first.length - 1]!.data.conversationId;
    const second = parseSse((await postSse(app, headers, { message: 'and now?', conversationId })).body);
    expect(second[0]!.data).toMatchObject({ type: 'status', conversationId });
    expect(second[second.length - 1]!.data).toMatchObject({ type: 'done', conversationId });
  });

  it('answers request errors before the stream as plain JSON', async () => {
    const { app } = scripted([]);
    const noConsent = await createUser();
    const r403 = await postSse(app, await authHeaderFor(noConsent.id), { message: 'hi' });
    expect(r403.status).toBe(403);
    expect(JSON.parse(r403.body)).toEqual({ error: 'consent_required' });
    const user = await consented();
    const r400 = await postSse(app, await authHeaderFor(user.id), { message: '' });
    expect(r400.status).toBe(400);
  });

  it('aborts the model call and keeps the partial reply, marked stopped, when the client disconnects', async () => {
    let signal: AbortSignal | undefined;
    const step = async function* (req: CoachStreamRequest): AsyncIterable<string> {
      signal = req.signal!;
      yield 'Rest is good today. ';
      await new Promise((_resolve, reject) => req.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const { app } = scripted([step]);
    const user = await consented();
    const headers = await authHeaderFor(user.id);
    const server = await testServer(app);
    try {
      const { port } = server.address() as AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, method: 'POST', path: '/me/coach/message', headers: { ...headers, Accept: 'text/event-stream', 'Content-Type': 'application/json' } },
          (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              if (chunk.includes('event: text')) {
                req.destroy();
                resolve();
              }
            });
          },
        );
        req.on('error', () => {});
        req.end(JSON.stringify({ message: 'Should I rest today?' }));
        setTimeout(() => reject(new Error('no text event')), 5000);
      });
      for (let i = 0; i < 200 && !(signal?.aborted && (await prisma.coachMessage.count({ where: { userId: user.id } })) === 2); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(signal?.aborted).toBe(true);
      const assistant = await prisma.coachMessage.findFirstOrThrow({ where: { userId: user.id, role: 'ASSISTANT' } });
      expect(assistant.text).toBe('Rest is good today.');
      expect(assistant.guardrailEvents).toEqual([{ type: 'stopped' }]);
    } finally {
      server.close();
    }
  });
});

describe('POST /me/coach/message without the Accept header (older apps)', () => {
  it('returns the old JSON shape from the same pipeline: reply plus disclaimer (no footnote in old builds), clean text stored', async () => {
    const { app } = scripted([['Your recovery is 72 today.\n', CARD]]);
    const user = await consented();
    await putScore(user.id, todayUtc(), 72.4);
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authHeaderFor(user.id)).send({ message: 'How am I doing?' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['conversationId', 'message']);
    expect(Object.keys(res.body.message).sort()).toEqual(['createdAt', 'id', 'role', 'source', 'text']);
    expect(res.body.message).toMatchObject({ role: 'assistant', source: 'model', text: `Your recovery is 72 today.\n\n${LEGACY_DISCLAIMER}` });
    const row = await prisma.coachMessage.findUniqueOrThrow({ where: { id: res.body.message.id } });
    expect(row.text).toBe('Your recovery is 72 today.');
    expect(row.createdAt.toISOString()).toBe(res.body.message.createdAt);
    expect(row.card).not.toBeNull();
  });

  it('never stores the disclaimer it adds to the JSON response, so the transcript and the next turn stay clean (R46)', async () => {
    const { app } = scripted([['Your recovery is 72 today.\n', CARD]]);
    const user = await consented();
    await putScore(user.id, todayUtc(), 72.4);
    const headers = await authHeaderFor(user.id);
    const res = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'How am I doing?' });
    expect(res.body.message.text.endsWith(LEGACY_DISCLAIMER)).toBe(true);
    expect(res.body.message.text.split(LEGACY_DISCLAIMER)).toHaveLength(2);

    const rows = await prisma.coachMessage.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.text).not.toContain(LEGACY_DISCLAIMER);
    const transcript = await request(await testServer(app)).get(`/me/coach/conversations/${res.body.conversationId}`).set(headers);
    expect(transcript.body.messages.map((m: { text: string }) => m.text)).toEqual(['How am I doing?', 'Your recovery is 72 today.']);
  });

  it('stops the answer and stores the partial reply, marked stopped, when an older client disconnects', async () => {
    let signal: AbortSignal | undefined;
    let shown!: () => void;
    const firstSentenceShown = new Promise<void>((r) => (shown = r));
    const step = async function* (req: CoachStreamRequest): AsyncIterable<string> {
      signal = req.signal!;
      yield 'Rest is good today. ';
      yield 'More';
      shown(); // the first sentence has been through validation by the time the second chunk is pulled
      await new Promise((_resolve, reject) => req.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const { app } = scripted([step]);
    const user = await consented();
    const headers = await authHeaderFor(user.id);
    const server = await testServer(app);
    try {
      const { port } = server.address() as AddressInfo;
      const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/me/coach/message', headers: { ...headers, 'Content-Type': 'application/json' } });
      req.on('error', () => {});
      req.end(JSON.stringify({ message: 'Should I rest today?' }));
      await firstSentenceShown;
      req.destroy();
      for (let i = 0; i < 200 && !(signal?.aborted && (await prisma.coachMessage.count({ where: { userId: user.id } })) === 2); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(signal?.aborted).toBe(true);
      const assistant = await prisma.coachMessage.findFirstOrThrow({ where: { userId: user.id, role: 'ASSISTANT' } });
      expect(assistant.text).toBe('Rest is good today.');
      expect(assistant.guardrailEvents).toEqual([{ type: 'stopped' }]);
    } finally {
      server.close();
    }
  });

  it.each([
    ['model_unavailable', [new Error('down')]],
    ['validation_failed', [['Your HRV is 99 ms.'], ['Your HRV is 98 ms.']]],
  ] as const)('maps a %s error to 503 with the code', async (code, script) => {
    const { app } = scripted([...script] as StreamStep[]);
    const user = await consented();
    const res = await request(await testServer(app)).post('/me/coach/message').set(await authHeaderFor(user.id)).send({ message: 'How am I doing?' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: code, retryable: true });
    expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('conversation transcripts carry the card', () => {
  it('GET /me/coach/conversations/:id returns card (null when none) on every message', async () => {
    const { app } = scripted([['Your recovery is 72 today.\n', CARD]]);
    const user = await consented();
    await putScore(user.id, todayUtc(), 72.4);
    const headers = await authHeaderFor(user.id);
    const sent = await request(await testServer(app)).post('/me/coach/message').set(headers).send({ message: 'How am I doing?' });
    const res = await request(await testServer(app)).get(`/me/coach/conversations/${sent.body.conversationId}`).set(headers);
    expect(res.body.messages.map((m: { card: unknown }) => m.card === null)).toEqual([true, false]);
    expect(res.body.messages[1].card.headline).toBe('Recovery is steady');
  });

  it('serves replies stored by older builds without the disclaimer and memory notes they carried', async () => {
    const user = await consented();
    const conversation = await prisma.coachConversation.create({ data: { userId: user.id } });
    const stored = `Noted.\n\n${LEGACY_REPLY_NOTES[0]}\n\n${LEGACY_DISCLAIMER}`;
    await prisma.coachMessage.create({ data: { conversationId: conversation.id, userId: user.id, role: 'USER', text: 'I run at 6am', createdAt: new Date(Date.now() - 1000) } });
    await prisma.coachMessage.create({ data: { conversationId: conversation.id, userId: user.id, role: 'ASSISTANT', text: stored, source: 'MODEL' } });
    const res = await request(await testServer(appWith(new UnconfiguredProvider()))).get(`/me/coach/conversations/${conversation.id}`).set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { text: string }) => m.text)).toEqual(['I run at 6am', 'Noted.']);
  });
});

describe('GET /me/coach/status warms the model', () => {
  it('starts a warm-up (fire-and-forget) when the coach is enabled, throttled', async () => {
    const provider = Object.assign(new ScriptedStreamProvider([]), { warm: jest.fn(() => new Promise<void>(() => {})) });
    const app = appWith(provider);
    const user = await createUser();
    const headers = await authHeaderFor(user.id);
    expect((await request(await testServer(app)).get('/me/coach/status').set(headers)).status).toBe(200);
    expect((await request(await testServer(app)).get('/me/coach/status').set(headers)).status).toBe(200);
    expect(provider.warm).toHaveBeenCalledTimes(1);
  });

  it('answers status normally when getting the provider throws', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.use(express.json());
    app.use(
      createCoachRouter({
        getProvider: () => {
          throw new Error('no provider');
        },
        telemetry: new RecordingTelemetry(),
        clock: new FakeClock(),
      }),
    );
    const user = await createUser();
    const res = await request(await testServer(app)).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    const logged = errors.mock.calls.map((c) => c.join(' ')).join('\n');
    // Logged as a warm-up failure, not as a failed status request (whose 500 would follow a sent 200).
    expect(logged).toContain('"where":"status_warm"');
    expect(logged).not.toContain('"where":"status"');
  });

  it('does not warm while the coach is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const provider = Object.assign(new ScriptedStreamProvider([]), { warm: jest.fn(async () => {}) });
    const user = await createUser();
    await request(await testServer(appWith(provider))).get('/me/coach/status').set(await authHeaderFor(user.id));
    expect(provider.warm).not.toHaveBeenCalled();
  });
});
