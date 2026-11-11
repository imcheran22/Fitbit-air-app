import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import { sendCoachPush } from '../../src/coach/coachPush';
import {
  ExpoPushSender, GENERIC_PUSH_PAYLOADS, GenericPushPayload, PushSender, PushTarget, isAllowedPushData, sendRecapPush,
} from '../../src/coach/push';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

class Recording implements PushSender {
  calls: Array<{ targets: PushTarget[]; payload: GenericPushPayload }> = [];
  async send(targets: PushTarget[], payload: GenericPushPayload) {
    this.calls.push({ targets, payload });
  }
}

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.COACH_ENABLED;
});
afterEach(() => {
  if (saved === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = saved;
});

async function withToken(over: { recapPushEnabled?: boolean } = {}) {
  const user = await createUser();
  if (over.recapPushEnabled !== undefined) await prisma.user.update({ where: { id: user.id }, data: { recapPushEnabled: over.recapPushEnabled } });
  await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
  return user;
}

describe('push table and data allowlist', () => {
  it('adds the fixed monthly recap strings, with no digit', () => {
    expect(GENERIC_PUSH_PAYLOADS.monthly_recap).toEqual({ title: 'Your monthly recap is ready', body: 'Open the app to see it.' });
    expect(GENERIC_PUSH_PAYLOADS.weekly_digest).toEqual({ title: 'Your weekly recap is ready', body: 'Open the app to read it.' });
    for (const p of Object.values(GENERIC_PUSH_PAYLOADS)) expect(`${p.title}${p.body}`).not.toMatch(/\d/);
  });

  it('allows only { kind: "recap", recapId: <uuid> }', () => {
    const id = randomUUID();
    expect(isAllowedPushData({ kind: 'recap', recapId: id })).toBe(true);
    for (const bad of [
      { kind: 'recap', recapId: id, text: 'Recovery 88' },
      { kind: 'digest', recapId: id },
      { kind: 'recap', recapId: 'not-a-uuid' },
      { kind: 'recap' },
      [id],
      null,
      'recap',
    ]) {
      expect(isAllowedPushData(bad)).toBe(false);
    }
  });

  it('the Expo sender refuses data outside the allowlist before any request', async () => {
    const fetchFn = jest.fn();
    const sender = new ExpoPushSender({ fetchFn: fetchFn as never });
    const payload = { kind: 'monthly_recap', ...GENERIC_PUSH_PAYLOADS.monthly_recap, data: { kind: 'recap', recapId: randomUUID(), score: 88 } };
    await expect(sender.send([{ token: 'ExponentPushToken[a]', platform: 'ios' }], payload as never)).rejects.toThrow('push_data_not_allowed');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('puts exactly the id-only data on the wire for a recap, and only the kind otherwise', async () => {
    const bodies: unknown[] = [];
    const fetchFn = jest.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
    });
    const sender = new ExpoPushSender({ fetchFn: fetchFn as never });
    const recapId = randomUUID();
    await sender.send([{ token: 'ExponentPushToken[a]', platform: 'ios' }], { kind: 'monthly_recap', ...GENERIC_PUSH_PAYLOADS.monthly_recap, data: { kind: 'recap', recapId } });
    await sender.send([{ token: 'ExponentPushToken[a]', platform: 'ios' }], { kind: 'insight', ...GENERIC_PUSH_PAYLOADS.insight });
    expect((bodies[0] as Array<{ data: unknown }>)[0]!.data).toEqual({ kind: 'recap', recapId });
    expect((bodies[1] as Array<{ data: unknown }>)[0]!.data).toEqual({ kind: 'insight' });
  });
});

describe('sendRecapPush (app-level)', () => {
  it('sends with the coach off when the user has a token and the setting on', async () => {
    delete process.env.COACH_ENABLED;
    const user = await withToken();
    const sender = new Recording();
    const recapId = randomUUID();
    expect(await sendRecapPush(sender, user.id, 'MONTH', recapId)).toBe(1);
    expect(sender.calls[0]!.payload).toEqual({ kind: 'monthly_recap', ...GENERIC_PUSH_PAYLOADS.monthly_recap, data: { kind: 'recap', recapId } });
    await sendRecapPush(sender, user.id, 'WEEK', recapId);
    expect(sender.calls[1]!.payload.kind).toBe('weekly_digest');
  });

  it('sends nothing with the setting off or no token', async () => {
    const sender = new Recording();
    expect(await sendRecapPush(sender, (await withToken({ recapPushEnabled: false })).id, 'WEEK', randomUUID())).toBe(0);
    expect(await sendRecapPush(sender, (await createUser()).id, 'WEEK', randomUUID())).toBe(0);
    expect(sender.calls).toHaveLength(0);
  });
});

describe('sendCoachPush (coach-gated)', () => {
  it('refuses while the coach is off or consent is not current; sends otherwise', async () => {
    const user = await withToken();
    const sender = new Recording();
    delete process.env.COACH_ENABLED;
    expect(await sendCoachPush(sender, user.id, 'insight')).toBe(0);
    process.env.COACH_ENABLED = 'true';
    expect(await sendCoachPush(sender, user.id, 'insight')).toBe(0);
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
    expect(await sendCoachPush(sender, user.id, 'insight')).toBe(1);
    expect(sender.calls).toHaveLength(1);
  });
});
