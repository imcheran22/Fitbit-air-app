import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createCoachRouter } from '../../src/coach/routes';
import { getPushSender, setPushSender } from '../../src/coach/config';
import {
  EXPO_PUSH_URL,
  ExpoPushSender,
  NoopPushSender,
  genericPushPayload,
  isExpoPushToken,
  maskPushToken,
  PushTarget,
} from '../../src/coach/push';
import { ScriptedStreamProvider } from '../../src/coach/model/provider';
import { FakeClock, RecordingTelemetry, createUser } from './helpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const saved: Record<string, string | undefined> = {};
const KEYS = ['COACH_ENABLED', 'PUSH_PROVIDER', 'EXPO_ACCESS_TOKEN'];
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.COACH_ENABLED = 'true';
  delete process.env.PUSH_PROVIDER;
  delete process.env.EXPO_ACCESS_TOKEN;
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

const tokenOf = (i: number) => `ExponentPushToken[secret${String(i).padStart(4, '0')}abcdefgh]`;
const targetsOf = (n: number, offset = 0): PushTarget[] =>
  Array.from({ length: n }, (_, i) => ({ token: tokenOf(i + offset), platform: 'ios' as const }));

interface Call {
  url: string;
  init: RequestInit;
  messages: Array<Record<string, unknown>>;
}

/** A fetch double: records calls and answers each with `respond(call, index)`. */
function fakeFetch(respond?: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call: Call = { url, init, messages: JSON.parse(String(init.body)) };
    calls.push(call);
    if (respond) return respond(call, calls.length - 1);
    return okResponse(call.messages.length);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const okResponse = (n: number) => json({ data: Array.from({ length: n }, () => ({ status: 'ok', id: 'x' })) });

function captureLogs() {
  const lines: string[] = [];
  const grab = (...args: unknown[]) => void lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  jest.spyOn(console, 'error').mockImplementation(grab);
  jest.spyOn(console, 'warn').mockImplementation(grab);
  jest.spyOn(console, 'info').mockImplementation(grab);
  jest.spyOn(console, 'log').mockImplementation(grab);
  return lines;
}

const payload = genericPushPayload('weekly_digest');

describe('ExpoPushSender requests', () => {
  it('posts a JSON array of generic messages to the Expo endpoint', async () => {
    const { fn, calls } = fakeFetch();
    await new ExpoPushSender({ fetchFn: fn }).send(targetsOf(2), payload);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(EXPO_PUSH_URL);
    expect(EXPO_PUSH_URL).toBe('https://exp.host/--/api/v2/push/send');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.messages).toEqual([
      { to: tokenOf(0), title: payload.title, body: payload.body, sound: 'default', data: { kind: 'weekly_digest' } },
      { to: tokenOf(1), title: payload.title, body: payload.body, sound: 'default', data: { kind: 'weekly_digest' } },
    ]);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('batches at 100 messages per request', async () => {
    const { fn, calls } = fakeFetch();
    await new ExpoPushSender({ fetchFn: fn }).send(targetsOf(250), payload);
    expect(calls.map((c) => c.messages.length)).toEqual([100, 100, 50]);
    expect(calls.flatMap((c) => c.messages.map((m) => m.to))).toEqual(targetsOf(250).map((t) => t.token));
  });

  it('exactly 100 targets is one request, and zero targets sends nothing', async () => {
    const { fn, calls } = fakeFetch();
    const sender = new ExpoPushSender({ fetchFn: fn });
    await sender.send(targetsOf(100), payload);
    await sender.send([], payload);
    expect(calls.map((c) => c.messages.length)).toEqual([100]);
  });

  it('sends Authorization only when an access token is configured', async () => {
    const a = fakeFetch();
    await new ExpoPushSender({ fetchFn: a.fn }).send(targetsOf(1), payload);
    expect((a.calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();

    process.env.EXPO_ACCESS_TOKEN = 'expo-secret-token';
    const b = fakeFetch();
    await new ExpoPushSender({ fetchFn: b.fn }).send(targetsOf(1), payload);
    expect((b.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer expo-secret-token');
  });

  it('treats a blank EXPO_ACCESS_TOKEN as unset', async () => {
    process.env.EXPO_ACCESS_TOKEN = '   ';
    const { fn, calls } = fakeFetch();
    await new ExpoPushSender({ fetchFn: fn }).send(targetsOf(1), payload);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('ExpoPushSender only sends the fixed generic text', () => {
  const bad: Array<[string, { kind: 'weekly_digest' | 'insight'; title: string; body: string }]> = [
    ['model-style text', { kind: 'weekly_digest', title: 'Your recovery is 82', body: 'Great job on your sleep' }],
    ['a health number in the body', { kind: 'weekly_digest', title: payload.title, body: 'Open the app. Score 91.' }],
    ['the title of another kind', { kind: 'weekly_digest', title: genericPushPayload('insight').title, body: payload.body }],
    ['an empty title', { kind: 'insight', title: '', body: genericPushPayload('insight').body }],
    ['an unknown kind', { kind: 'nope' as never, title: payload.title, body: payload.body }],
  ];

  it.each(bad)('refuses %s and never touches the network', async (_name, p) => {
    const { fn, calls } = fakeFetch();
    await expect(new ExpoPushSender({ fetchFn: fn }).send(targetsOf(1), p)).rejects.toThrow('push_text_not_generic');
    expect(calls).toHaveLength(0);
  });

  it('accepts every fixed payload', async () => {
    const { fn, calls } = fakeFetch();
    const sender = new ExpoPushSender({ fetchFn: fn });
    await sender.send(targetsOf(1), genericPushPayload('weekly_digest'));
    await sender.send(targetsOf(1), genericPushPayload('insight'));
    expect(calls).toHaveLength(2);
  });
});

describe('ExpoPushSender ticket handling', () => {
  it('deletes the row for DeviceNotRegistered and keeps rows for other errors and ok tickets', async () => {
    const user = await createUser();
    const tokens = [0, 1, 2].map((i) => `ExponentPushToken[ticket-${user.id}-${i}]`);
    await prisma.pushToken.createMany({ data: tokens.map((token) => ({ userId: user.id, token, platform: 'ios' as const })) });
    const logs = captureLogs();
    const { fn } = fakeFetch(() =>
      json({
        data: [
          { status: 'error', message: `"${tokens[0]}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'too much', details: { error: 'MessageRateExceeded' } },
          { status: 'ok', id: 'abc' },
        ],
      }),
    );

    await new ExpoPushSender({ fetchFn: fn }).send(
      tokens.map((token) => ({ token, platform: 'ios' as const })),
      payload,
    );

    const left = await prisma.pushToken.findMany({ where: { userId: user.id }, select: { token: true } });
    expect(left.map((r) => r.token).sort()).toEqual([tokens[1], tokens[2]].sort());
    const all = logs.join('\n');
    expect(all).toContain('MessageRateExceeded');
    for (const t of tokens) expect(all).not.toContain(t);
  });

  it('never logs a full token, on ticket errors, HTTP failures or thrown fetches', async () => {
    const logs = captureLogs();
    const responses = [
      () => json({ data: [{ status: 'error', message: `bad ${tokenOf(0)}`, details: { error: 'InvalidCredentials' } }] }),
      () => json({ errors: [{ code: 'X', message: `bad ${tokenOf(1)}` }] }, 400),
      () => {
        throw new TypeError(`network down for ${tokenOf(2)}`);
      },
    ];
    for (const [i, respond] of responses.entries()) {
      const { fn } = fakeFetch(respond);
      await new ExpoPushSender({ fetchFn: fn }).send(targetsOf(1, i), payload);
    }
    const all = logs.join('\n');
    expect(all.length).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      expect(all).not.toContain(tokenOf(i));
      expect(all).not.toContain(`secret000${i}abcdefgh`);
    }
    expect(all).toContain('ExponentPushToken[secr…]');
  });

  it('never logs the access token', async () => {
    process.env.EXPO_ACCESS_TOKEN = 'expo-secret-token';
    const logs = captureLogs();
    const { fn } = fakeFetch(() => json({}, 401));
    await new ExpoPushSender({ fetchFn: fn }).send(targetsOf(1), payload);
    expect(logs.join('\n')).not.toContain('expo-secret-token');
  });

  it('a failing chunk does not lose the other chunks results or throw', async () => {
    const user = await createUser();
    const tokens = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[chunk-${user.id}-${i}]`);
    await prisma.pushToken.createMany({ data: tokens.map((token) => ({ userId: user.id, token, platform: 'android' as const })) });
    const logs = captureLogs();
    const { fn, calls } = fakeFetch((call, i) => {
      if (i === 1) return json({ errors: [] }, 500);
      // chunks 0 and 2: first ticket says DeviceNotRegistered, rest ok
      return json({
        data: call.messages.map((_, j) => (j === 0 ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })),
      });
    });

    await expect(
      new ExpoPushSender({ fetchFn: fn }).send(
        tokens.map((token) => ({ token, platform: 'android' as const })),
        payload,
      ),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(3);
    const remaining = new Set((await prisma.pushToken.findMany({ where: { userId: user.id }, select: { token: true } })).map((r) => r.token));
    expect(remaining.size).toBe(248);
    expect(remaining.has(tokens[0]!)).toBe(false); // chunk 0 ticket 0
    expect(remaining.has(tokens[200]!)).toBe(false); // chunk 2 ticket 0
    expect(remaining.has(tokens[100]!)).toBe(true); // failed chunk: nothing deleted
    expect(logs.join('\n')).toContain('coach.push_chunk_failed');
  });

  it('survives a malformed response body and a ticket-count mismatch', async () => {
    const user = await createUser();
    const token = `ExponentPushToken[bad-${user.id}]`;
    await prisma.pushToken.create({ data: { userId: user.id, token, platform: 'ios' } });
    captureLogs();
    for (const respond of [
      () => new Response('<html>oops</html>', { status: 200 }),
      () => json({ data: [] }),
      () => json({ data: 'nope' }),
      () => json(null),
    ]) {
      const { fn } = fakeFetch(respond);
      await expect(new ExpoPushSender({ fetchFn: fn }).send([{ token, platform: 'ios' }], payload)).resolves.toBeUndefined();
    }
    expect(await prisma.pushToken.count({ where: { token } })).toBe(1);
  });
});

describe('maskPushToken / isExpoPushToken', () => {
  it('masks all but the first four characters inside the brackets', () => {
    expect(maskPushToken('ExponentPushToken[abcdefghijkl]')).toBe('ExponentPushToken[abcd…]');
    expect(maskPushToken('ExpoPushToken[xy]')).toBe('ExpoPushToken[xy…]');
    expect(maskPushToken('some-random-token-value')).toBe('some…');
  });

  it('recognises Expo token shapes only', () => {
    expect(isExpoPushToken('ExponentPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[abc')).toBe(false);
    expect(isExpoPushToken('abc')).toBe(false);
    expect(isExpoPushToken('xExponentPushToken[abc]')).toBe(false);
  });
});

describe('provider selection (PUSH_PROVIDER)', () => {
  afterEach(() => setPushSender(null));

  it('defaults to the no-op sender', () => {
    expect(getPushSender()).toBeInstanceOf(NoopPushSender);
  });

  it('selects the Expo sender for expo, case-insensitively, and noop for anything else', () => {
    process.env.PUSH_PROVIDER = 'expo';
    expect(getPushSender()).toBeInstanceOf(ExpoPushSender);
    process.env.PUSH_PROVIDER = ' EXPO ';
    expect(getPushSender()).toBeInstanceOf(ExpoPushSender);
    process.env.PUSH_PROVIDER = 'noop';
    expect(getPushSender()).toBeInstanceOf(NoopPushSender);
    process.env.PUSH_PROVIDER = 'apns';
    expect(getPushSender()).toBeInstanceOf(NoopPushSender);
  });

  it('an explicit setPushSender override wins over the environment', () => {
    process.env.PUSH_PROVIDER = 'expo';
    const custom = new NoopPushSender();
    setPushSender(custom);
    expect(getPushSender()).toBe(custom);
  });
});

describe('POST /me/push-token shape validation', () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use(createCoachRouter({ getProvider: () => new ScriptedStreamProvider([]), telemetry: new RecordingTelemetry(), clock: new FakeClock() }));
    return a;
  }
  async function authed(userId: string) {
    return authHeaderFor(userId);
  }

  it('with expo, rejects a token that is not Expo-shaped with 400 and stores nothing', async () => {
    process.env.PUSH_PROVIDER = 'expo';
    const user = await createUser();
    const raw = `raw-apns-token-${user.id}`;
    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(user.id)).send({ token: raw, platform: 'ios' });
    expect(res.status).toBe(400);
    expect(await prisma.pushToken.count({ where: { token: raw } })).toBe(0);
  });

  it.each(['ExponentPushToken', 'ExpoPushToken'])('with expo, accepts a %s[...] token', async (prefix) => {
    process.env.PUSH_PROVIDER = 'expo';
    const user = await createUser();
    const token = `${prefix}[${user.id}]`;
    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(user.id)).send({ token, platform: 'ios' });
    expect(res.status).toBe(204);
    expect(await prisma.pushToken.count({ where: { token } })).toBe(1);
  });

  it('with noop (default) accepts any token shape, as before', async () => {
    const user = await createUser();
    const token = `raw-apns-token-${user.id}`;
    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(user.id)).send({ token, platform: 'android' });
    expect(res.status).toBe(204);
  });

  it('DELETE is unchanged under expo: any well-formed token string is accepted', async () => {
    process.env.PUSH_PROVIDER = 'expo';
    const user = await createUser();
    const token = `raw-${user.id}`;
    await prisma.pushToken.create({ data: { userId: user.id, token, platform: 'ios' } });
    const res = await request(await testServer(app())).delete('/me/push-token').set(await authed(user.id)).send({ token });
    expect(res.status).toBe(204);
    expect(await prisma.pushToken.count({ where: { token } })).toBe(0);
  });

  // Security: the upsert was keyed on the globally unique token and rewrote
  // userId unconditionally, so anyone holding another user's token could
  // silently redirect their coach notifications.
  it('refuses to move a token already registered to a different user', async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const token = `raw-shared-${victim.id}`;
    await prisma.pushToken.create({ data: { userId: victim.id, token, platform: 'ios' } });

    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(attacker.id)).send({ token, platform: 'ios' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'token_registered_to_another_account' });
    const row = await prisma.pushToken.findUnique({ where: { token } });
    expect(row?.userId).toBe(victim.id);
  });

  it('re-registering your own token stays idempotent and can update the platform', async () => {
    const user = await createUser();
    const token = `raw-own-${user.id}`;
    await prisma.pushToken.create({ data: { userId: user.id, token, platform: 'ios' } });

    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(user.id)).send({ token, platform: 'android' });

    expect(res.status).toBe(204);
    const row = await prisma.pushToken.findUnique({ where: { token } });
    expect(row).toMatchObject({ userId: user.id, platform: 'android' });
  });

  it('auth (401) is unchanged under expo, and a token registers with the coach flag off (app-level)', async () => {
    process.env.PUSH_PROVIDER = 'expo';
    const user = await createUser();
    expect((await request(await testServer(app())).post('/me/push-token').send({ token: 'x', platform: 'ios' })).status).toBe(401);
    process.env.COACH_ENABLED = 'false';
    const token = `ExponentPushToken[${user.id.slice(0, 8)}]`;
    const res = await request(await testServer(app())).post('/me/push-token').set(await authed(user.id)).send({ token, platform: 'ios' });
    expect(res.status).toBe(204);
  });
});
