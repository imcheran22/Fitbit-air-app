import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { defaultFactData, FactData, FactSheet } from '../../src/coach/answer/facts';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import {
  composeDigestFallback,
  DIGEST_MAX_TOKENS,
  DIGEST_REQUEST,
  DigestDeps,
  hasMaterial,
  runWeeklyDigest,
  weekStartOf,
} from '../../src/coach/digest';
import { CoachModelProvider, ScriptedStreamProvider, StreamStep, UnconfiguredProvider } from '../../src/coach/model/provider';
import {
  GENERIC_PUSH_PAYLOADS,
  GenericPushPayload,
  NoopPushSender,
  PushSender,
  PushTarget,
  genericPushPayload,
  sendGenericPush,
} from '../../src/coach/push';
import * as personas from '../../src/coach/personas';
import { FakeClock, RecordingTelemetry, createUser, daysAgo, putScore, settle, todayUtc } from './helpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  jest.restoreAllMocks();
});

class RecordingPushSender implements PushSender {
  calls: Array<{ targets: PushTarget[]; payload: GenericPushPayload }> = [];
  async send(targets: PushTarget[], payload: GenericPushPayload): Promise<void> {
    this.calls.push({ targets, payload });
  }
}

// digestUser's week: Recovery 60, 65, 70, 75, 80, 70, 70 -> 7-day and 30-day average 70.
const GOOD_DIGEST = 'Your recovery averaged 70 across the last 7 days. That is a steady week. Keep your bedtime where it is.';
const GOOD_TEXT = GOOD_DIGEST;
const FALLBACK_TEXT = "Here's your week. Recovery averaged 70 over the last 7 days.";

/** A consented user (default persona: mochi, threshold-triggered) with 7 days of recovery + sleep scores. */
async function digestUser(opts: { persona?: string | null; consent?: boolean; scores?: boolean } = {}) {
  const user = await createUser();
  if (opts.persona !== undefined) await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: opts.persona } });
  if (opts.consent !== false) await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  if (opts.scores !== false) {
    const recovery = [60, 65, 70, 75, 80, 70, 70];
    const sleep = [80, 82, 84, 86, 88, 90, 90];
    for (let i = 0; i < 7; i++) {
      await putScore(user.id, daysAgo(6 - i), recovery[i]!, 'RECOVERY');
      await putScore(user.id, daysAgo(6 - i), sleep[i]!, 'SLEEP');
    }
  }
  return user;
}

function setup(script: StreamStep[] | CoachModelProvider, over: Partial<DigestDeps> = {}) {
  const provider = Array.isArray(script) ? new ScriptedStreamProvider(script) : script;
  const telemetry = new RecordingTelemetry();
  const pushSender = new RecordingPushSender();
  const clock = new FakeClock();
  const deps: DigestDeps = { provider, telemetry, pushSender, clock, ...over };
  return { provider: provider as ScriptedStreamProvider, telemetry, pushSender, clock, deps };
}

const digestsOf = (userId: string) => prisma.coachDigest.findMany({ where: { userId } });
const sweep = (deps: DigestDeps, ...userIds: string[]) => runWeeklyDigest({ ...deps, userIds });

/** A stream step that never produces anything until its request is aborted. */
const hangUntilAborted: StreamStep = (request) =>
  (async function* () {
    await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve(), { once: true }));
    throw new Error('aborted');
  })();

describe('weekStartOf', () => {
  it.each([
    ['2026-09-21', '2026-09-21'], // Monday
    ['2026-09-22', '2026-09-21'],
    ['2026-09-27', '2026-09-21'], // Sunday belongs to the week that started the Monday before
    ['2026-09-20', '2026-09-14'], // Sunday
    ['2026-01-01', '2025-12-29'], // across a year boundary
  ])('%s -> %s', (date, monday) => {
    expect(weekStartOf(date)).toBe(monday);
  });
});

describe('gating', () => {
  it('does nothing when COACH_ENABLED is off: no users read, no model call, no digest, no push', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await digestUser();
    const { deps, provider, pushSender } = setup([GOOD_DIGEST]);

    const summary = await sweep(deps, user.id);

    expect(summary).toEqual({ enabled: false, usersChecked: 0, generated: 0, skipped: 0, failed: 0 });
    expect(provider.callCount).toBe(0);
    expect(await digestsOf(user.id)).toHaveLength(0);
    expect(pushSender.calls).toHaveLength(0);
  });

  it.each([
    ['no consent row', async (id: string) => prisma.coachConsent.deleteMany({ where: { userId: id } })],
    ['revoked consent', async (id: string) => prisma.coachConsent.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } })],
    ['consent for an outdated version', async (id: string) => prisma.coachConsent.updateMany({ where: { userId: id }, data: { version: '0' } })],
  ])('skips a user with %s (no model call, no digest, no push)', async (_label, mutate) => {
    const user = await digestUser();
    await mutate(user.id);
    const { deps, provider, pushSender, telemetry } = setup([GOOD_DIGEST]);

    const summary = await sweep(deps, user.id);

    expect(summary.generated).toBe(0);
    expect(provider.callCount).toBe(0);
    expect(await digestsOf(user.id)).toHaveLength(0);
    expect(pushSender.calls).toHaveLength(0);
    expect(telemetry.named('coach.digest_generated')).toHaveLength(0);
  });

  it('a user whose only consent is the HOSTED scope is not a digest candidate', async () => {
    const user = await digestUser();
    await prisma.coachConsent.updateMany({ where: { userId: user.id }, data: { scope: 'HOSTED' } });
    const { deps, provider } = setup([GOOD_DIGEST]);

    const summary = await sweep(deps, user.id);

    expect(summary).toMatchObject({ usersChecked: 0, generated: 0 });
    expect(provider.callCount).toBe(0);
  });

  // No live persona is reactive-only (every character is threshold-triggered), but the gate stays for
  // any later persona set, so it is exercised through a stubbed persona.
  it("skips a 'reactive-only' persona", async () => {
    const user = await digestUser();
    const mochi = personas.resolvePersona('mochi');
    jest.spyOn(personas, 'resolvePersona').mockReturnValue({ ...mochi, proactivity: 'reactive-only' });
    const { deps, provider, pushSender, telemetry } = setup([GOOD_DIGEST]);

    const summary = await sweep(deps, user.id);

    expect(summary).toMatchObject({ usersChecked: 1, generated: 0, skipped: 1 });
    expect(provider.callCount).toBe(0);
    expect(await digestsOf(user.id)).toHaveLength(0);
    expect(pushSender.calls).toHaveLength(0);
    expect(telemetry.named('coach.digest_skipped')[0]!.attributes).toEqual({ reason: 'skipped_reactive_only' });
  });

  it('generates for the default persona (no stored id) and for an unknown stored persona id', async () => {
    const a = await digestUser();
    const b = await digestUser({ persona: 'retired-persona' }); // falls back to the default persona
    const { deps } = setup([GOOD_DIGEST, GOOD_DIGEST]);
    const summary = await sweep(deps, a.id, b.id);
    expect(summary.generated).toBe(2);
  });

  it('skips a user with nothing to recap (only the sleep goal): no model call, no push', async () => {
    const user = await digestUser({ scores: false });
    const { deps, provider, pushSender, telemetry } = setup([GOOD_DIGEST]);

    await sweep(deps, user.id);

    expect(provider.callCount).toBe(0);
    expect(await digestsOf(user.id)).toHaveLength(0);
    expect(pushSender.calls).toHaveLength(0);
    expect(telemetry.named('coach.digest_skipped')[0]!.attributes).toEqual({ reason: 'skipped_no_data' });
  });
});

describe('companion characters', () => {
  // Spec 2026-09-29 section 2: the choice of character never turns the weekly recap on or off.
  it.each(personas.listPersonas().map((p) => p.id))(
    '%s gets a weekly recap written in its own persona',
    async (id) => {
      const user = await digestUser({ persona: id });
      const { deps, provider } = setup([GOOD_DIGEST]);

      const summary = await sweep(deps, user.id);

      expect(summary).toMatchObject({ usersChecked: 1, generated: 1, skipped: 0 });
      const [row] = await digestsOf(user.id);
      expect(row!.personaId).toBe(id);
      const persona = personas.findPersona(id)!;
      expect(provider.requests[0]!.system).toContain(`- name: ${JSON.stringify(persona.name)}`);
      expect(provider.requests[0]!.system).toContain(`- coaching focus: ${JSON.stringify(persona.focus)}`);
    },
  );

  // Ruling R6: a legacy v1 id or a retired character id is unknown, so the recap comes from the default coach.
  it.each(['encouraging', 'direct', 'clinical', 'hoot', 'pip', 'beep'])(
    'a user with the unknown stored id %s (not yet migrated) gets a recap from the default coach, mochi',
    async (stored) => {
      const user = await digestUser({ persona: stored });
      const { deps } = setup([GOOD_DIGEST]);

      const summary = await sweep(deps, user.id);

      expect(summary.generated).toBe(1);
      expect((await digestsOf(user.id))[0]!.personaId).toBe('mochi');
    },
  );
});

describe('generation (trends fact sheet, validated like replies)', () => {
  it('stores the validated recap as written, without a disclaimer, from one streamed call over the trends fact sheet', async () => {
    const user = await digestUser();
    const { deps, provider, telemetry } = setup([['Your recovery averaged 70 ', 'across the last 7 days. That is a steady week. ', 'Keep your bedtime where it is.']]);

    const summary = await sweep(deps, user.id);

    expect(summary).toMatchObject({ enabled: true, usersChecked: 1, generated: 1, failed: 0 });
    const [row] = await digestsOf(user.id);
    expect(row!.text).toBe(GOOD_TEXT);
    expect(row!.text).not.toMatch(/medical assessment/);
    expect(row!.personaId).toBe('mochi');
    expect(row!.weekStart.toISOString().slice(0, 10)).toBe(weekStartOf(todayUtc()));

    expect(provider.callCount).toBe(1);
    const request = provider.requests[0]!;
    expect(request.maxTokens).toBe(DIGEST_MAX_TOKENS);
    expect(request.messages).toEqual([{ role: 'user', content: DIGEST_REQUEST }]);
    expect(request.system).toContain('FACTS START\n[recovery.avg7] Recovery 7-day average: 70 (usual 70, same as usual)');
    expect(request.system).toContain('[recovery.avg30] Recovery 30-day average: 70');
    expect(request.system).not.toMatch(/\{\{|getScoreHistory|recoveryHistory/);
    expect(telemetry.named('coach.digest_generated')[0]!.attributes).toMatchObject({ source: 'model', dropped: 0, attempts: 1 });
  });

  it('drops a sentence with an invented number and keeps the rest', async () => {
    const user = await digestUser();
    const { deps, provider, telemetry } = setup([
      'Your recovery averaged 70 across the last 7 days. Your HRV hit 95 ms on Tuesday. Keep your bedtime where it is.',
    ]);

    await sweep(deps, user.id);

    expect(provider.callCount).toBe(1);
    const [row] = await digestsOf(user.id);
    expect(row!.text).toBe('Your recovery averaged 70 across the last 7 days. Keep your bedtime where it is.');
    expect(telemetry.named('coach.digest_generated')[0]!.attributes).toMatchObject({ source: 'model', dropped: 1, attempts: 1 });
  });

  it('ignores any card or memory block after the recap and stores no memory', async () => {
    const user = await digestUser();
    const { deps } = setup([
      `${GOOD_DIGEST}\n\`\`\`card\n{"headline":"Week","tiles":[{"fact":"recovery.avg7","label":"Recovery"}]}\n\`\`\`\n\`\`\`memory\n{"category":"PREFERENCE","value":"Likes tea"}\n\`\`\``,
    ]);

    await sweep(deps, user.id);

    expect((await digestsOf(user.id))[0]!.text).toBe(GOOD_TEXT);
    expect(await prisma.coachMemory.count({ where: { userId: user.id } })).toBe(0);
  });

  it('asks once more when no sentence survives, without resending the rejected text', async () => {
    const user = await digestUser();
    const { deps, provider, telemetry } = setup(['Your recovery averaged 91 this week.', GOOD_DIGEST]);

    await sweep(deps, user.id);

    expect(provider.callCount).toBe(2);
    const second = provider.requests[1]!.messages;
    expect(second[0]).toEqual({ role: 'user', content: DIGEST_REQUEST });
    expect(second[1]!.content).toMatch(/^\[system notice\] Your previous answer could not be shown/);
    expect(JSON.stringify(second)).not.toContain('91');
    expect((await digestsOf(user.id))[0]!.text).toBe(GOOD_TEXT);
    expect(telemetry.named('coach.digest_generated')[0]!.attributes).toMatchObject({ source: 'model', dropped: 1, attempts: 2 });
  });

  it.each([
    ['invented numbers', 'You slept 8 hours and 12 minutes on average.'],
    ['a disallowed topic', 'Try some melatonin before bed.'],
    ['an empty reply', '   '],
  ])('two replies with nothing valid (%s) fall back to the server-composed recap', async (_label, bad) => {
    const user = await digestUser();
    const { deps, provider, telemetry } = setup([bad, bad]);

    await sweep(deps, user.id);

    expect(provider.callCount).toBe(2); // exactly one retry, nothing more
    const [row] = await digestsOf(user.id);
    expect(row!.text).toBe(FALLBACK_TEXT);
    expect(telemetry.named('coach.digest_generated')[0]!.attributes).toMatchObject({ source: 'fallback', attempts: 2 });
  });

  it('falls back when the provider is unconfigured or the stream drops', async () => {
    const a = await digestUser();
    await sweep(setup(new UnconfiguredProvider()).deps, a.id);
    expect((await digestsOf(a.id))[0]!.text).toBe(FALLBACK_TEXT);

    const b = await digestUser();
    await sweep(setup([{ chunks: ['Your recovery averaged 70 '], error: new Error('socket closed') }]).deps, b.id);
    expect((await digestsOf(b.id))[0]!.text).toBe(FALLBACK_TEXT);
  });

  it('falls back at the budget, aborts the call and leaves no timer behind', async () => {
    const user = await digestUser();
    const { deps, clock, provider } = setup([hangUntilAborted]);
    const running = sweep(deps, user.id);
    // Wait (on real time, bounded) until the digest generation has armed its budget timer.
    for (let i = 0; i < 500 && clock.pendingTimers === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await settle();
    expect(clock.pendingTimers).toBe(1);
    clock.advance(61_000);
    const summary = await running;

    expect(summary.generated).toBe(1);
    expect((await digestsOf(user.id))[0]!.text).toBe(FALLBACK_TEXT);
    expect(provider.requests[0]!.signal?.aborted).toBe(true);
    expect(clock.pendingTimers).toBe(0);
  });

  it('cancels its timer after a normal run', async () => {
    const user = await digestUser();
    const { deps, clock } = setup([GOOD_DIGEST]);
    await sweep(deps, user.id);
    expect(clock.pendingTimers).toBe(0);
  });

  it('the fallback includes confirmed habit patterns, validated like everything else', async () => {
    const user = await digestUser({ scores: false });
    const factData: FactData = {
      ...defaultFactData,
      getHabitCorrelations: async () => ({
        correlations: [
          {
            habitType: 'caffeine',
            habitLabel: 'Late caffeine',
            exposureThreshold: 1,
            exposureUnit: 'cups',
            factor: 'HRV',
            lagDays: 1,
            effectSizePercent: -12.5,
            comparisonPercent: 87.5,
            sampleSize: 30,
            direction: 'lower',
          },
        ],
      }),
    };
    const { deps } = setup(new UnconfiguredProvider(), { factData });
    await sweep(deps, user.id);
    expect((await digestsOf(user.id))[0]!.text).toBe("Here's your week. Late caffeine and next-day HRV: 13% lower.");
  });
});

describe('composeDigestFallback and hasMaterial', () => {
  const sheet = (facts: FactSheet['facts']): FactSheet => ({ route: 'trends', facts, notes: [] });
  const goal = { id: 'sleep.goal', label: 'Sleep goal', value: 480, unit: 'minutes' as const, display: '8h 0m' };

  it('has nothing to say with only the sleep goal', () => {
    expect(hasMaterial(sheet([goal]))).toBe(false);
    expect(composeDigestFallback(sheet([goal]))).toBeNull();
  });

  it('states each weekly average against the 30-day one when they differ', () => {
    const text = composeDigestFallback(
      sheet([
        goal,
        { id: 'recovery.avg7', label: 'Recovery 7-day average', value: 64, unit: 'score', display: '64', usual: 58 },
        { id: 'sleep.avg7', label: 'Sleep 7-day average', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
        { id: 'hrv.avg7', label: 'HRV 7-day average', value: 41, unit: 'ms', display: '41 ms', usual: 41 },
        { id: 'rhr.avg7', label: 'Resting heart rate 7-day average', value: 58, unit: 'bpm', display: '58 bpm', usual: 55, lowerIsBetter: true },
      ]),
    );
    expect(text).toBe(
      "Here's your week. Recovery averaged 64 over the last 7 days, against your usual 58. " +
        'Sleep averaged 6h 48m a night, against your usual 7h 13m. HRV averaged 41 ms. ' +
        'Resting heart rate averaged 58 bpm, against your usual 55 bpm.',
    );
    expect(hasMaterial(sheet([goal, { id: 'hrv.avg7', label: 'HRV 7-day average', value: 41, unit: 'ms', display: '41 ms' }]))).toBe(true);
  });
});

describe('idempotency per user and week', () => {
  it('a second run in the same week creates no second digest, calls no model, sends no second push', async () => {
    const user = await digestUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `t-${user.id}`, platform: 'ios' } });
    const { deps, provider, pushSender } = setup([GOOD_DIGEST, GOOD_DIGEST]);

    await sweep(deps, user.id);
    const again = await sweep(deps, user.id);

    expect(await digestsOf(user.id)).toHaveLength(1);
    expect(again).toMatchObject({ generated: 0, skipped: 1 });
    expect(provider.callCount).toBe(1);
    expect(pushSender.calls).toHaveLength(1);
  });

  it("a digest from an earlier week does not block this week's", async () => {
    const user = await digestUser();
    await prisma.coachDigest.create({
      data: {
        userId: user.id,
        text: 'last week',
        personaId: 'encouraging',
        weekStart: civilDateToUtcMidnight(weekStartOf(daysAgo(7))),
      },
    });
    const { deps } = setup([GOOD_DIGEST]);
    await sweep(deps, user.id);
    expect(await digestsOf(user.id)).toHaveLength(2);
  });

  it('two racing runs keep exactly one digest and only the winner pushes (unique key)', async () => {
    const user = await digestUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `t-${user.id}`, platform: 'ios' } });
    await prisma.coachDigest.create({
      data: { userId: user.id, text: 'already here', personaId: 'encouraging', weekStart: civilDateToUtcMidnight(weekStartOf(todayUtc())) },
    });
    // Simulate the loser of a race: the pre-check saw nothing, the insert hits the unique key.
    jest.spyOn(prisma.coachDigest, 'findUnique').mockResolvedValueOnce(null);
    const { deps, pushSender } = setup([GOOD_DIGEST]);

    const summary = await sweep(deps, user.id);

    expect(summary).toMatchObject({ generated: 0, skipped: 1, failed: 0 });
    expect(await digestsOf(user.id)).toHaveLength(1);
    expect((await digestsOf(user.id))[0]!.text).toBe('already here');
    expect(pushSender.calls).toHaveLength(0);
  });
});

describe('push content is generic', () => {
  const ALLOWED = new Set(Object.values(GENERIC_PUSH_PAYLOADS).flatMap((p) => [p.title, p.body]));

  it('the fixed strings from the spec are in the set and none contains a digit', () => {
    expect(GENERIC_PUSH_PAYLOADS.weekly_digest.title).toBe('Your weekly recap is ready');
    expect(GENERIC_PUSH_PAYLOADS.insight.title).toBe('You have a new insight');
    for (const s of ALLOWED) expect(s).not.toMatch(/\d/);
  });

  it('the digest push is always one of the fixed payloads, whatever the digest text or health values are', async () => {
    const user = await digestUser();
    await prisma.pushToken.createMany({
      data: [
        { userId: user.id, token: `ios-${user.id}`, platform: 'ios' },
        { userId: user.id, token: `and-${user.id}`, platform: 'android' },
      ],
    });
    const { deps, pushSender } = setup(['Your recovery averaged 70 and dipped to 60 at its lowest.']);

    await sweep(deps, user.id);

    expect(pushSender.calls).toHaveLength(1);
    const { targets, payload } = pushSender.calls[0]!;
    expect(payload).toEqual({ kind: 'weekly_digest', ...GENERIC_PUSH_PAYLOADS.weekly_digest });
    expect(ALLOWED.has(payload.title)).toBe(true);
    expect(ALLOWED.has(payload.body)).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/\d/);
    expect(JSON.stringify(payload)).not.toMatch(/recovery|hrv|score|habit|average/i);
    expect(targets.map((t) => t.platform).sort()).toEqual(['android', 'ios']);
  });

  it('sendGenericPush takes a kind, not text: the payload cannot carry anything else', async () => {
    const user = await createUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `k-${user.id}`, platform: 'ios' } });
    const sender = new RecordingPushSender();
    // @ts-expect-error a free-text kind is a compile error; at runtime it would be an unknown table key
    await expect(sendGenericPush(sender, user.id, 'Your HRV dropped to 41')).rejects.toThrow('unknown_push_kind');
    expect(sender.calls).toHaveLength(0);

    expect(await sendGenericPush(sender, user.id, 'insight')).toBe(1);
    expect(sender.calls[0]!.payload).toEqual({ kind: 'insight', ...GENERIC_PUSH_PAYLOADS.insight });
    expect(genericPushPayload('weekly_digest')).toEqual({ kind: 'weekly_digest', ...GENERIC_PUSH_PAYLOADS.weekly_digest });
  });

  it('mutating a returned payload cannot change the fixed table', () => {
    const p = genericPushPayload('weekly_digest');
    p.title = 'Your HRV is 41';
    expect(genericPushPayload('weekly_digest').title).toBe('Your weekly recap is ready');
    expect(() => {
      (GENERIC_PUSH_PAYLOADS.weekly_digest as { title: string }).title = 'x';
    }).toThrow();
  });

  it('is never called for a user with no registered device', async () => {
    const user = await digestUser();
    const { deps, pushSender } = setup([GOOD_DIGEST]);
    await sweep(deps, user.id);
    expect(pushSender.calls).toHaveLength(0);
  });

  it('a push failure does not undo or repeat the stored digest', async () => {
    const user = await digestUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `f-${user.id}`, platform: 'ios' } });
    const failing: PushSender = { send: async () => { throw new TypeError('provider down: secret text'); } };
    const { deps, telemetry } = setup([GOOD_DIGEST], { pushSender: failing });

    const summary = await sweep(deps, user.id);

    expect(summary).toMatchObject({ generated: 1, failed: 0 });
    expect(await digestsOf(user.id)).toHaveLength(1);
    expect(telemetry.named('coach.push_failed')[0]!.attributes).toEqual({ kind: 'weekly_digest', error: 'TypeError' });
    expect(JSON.stringify(telemetry.events)).not.toContain('secret text');
  });

  it('the NoopPushSender delivers nothing', async () => {
    await expect(new NoopPushSender().send()).resolves.toBeUndefined();
  });

  it('only push.ts calls a PushSender; only coachPush.ts calls sendGenericPush, with literal coach kinds', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith('.ts')) files.push(path.join(d, e.name));
      }
    };
    walk(path.join(__dirname, '../../src/coach'));
    walk(path.join(__dirname, '../../src/recap'));
    const senderCalls = files.filter((f) => /(pushSender|sender)\.send\(/.test(fs.readFileSync(f, 'utf8')));
    expect(senderCalls.map((f) => path.basename(f))).toEqual(['push.ts']);
    const generic = files.filter((f) => /sendGenericPush\(/.test(fs.readFileSync(f, 'utf8')) && path.basename(f) !== 'push.ts');
    expect(generic.map((f) => path.basename(f))).toEqual(['coachPush.ts']);
    for (const f of files.filter((f) => !['push.ts', 'coachPush.ts'].includes(path.basename(f)))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/sendCoachPush\(([^)]*)\)/g)) expect(m[1]).toMatch(/,\s*'(weekly_digest|insight)'\s*$/);
    }
  });
});

describe('sweep robustness and telemetry', () => {
  it('one user failing does not stop the sweep; the failure is reported by error name only', async () => {
    const a = await digestUser();
    const b = await digestUser();
    const factData: FactData = {
      ...defaultFactData,
      getScoreHistory: async (userId, metric, days, today) => {
        if (userId === a.id) throw new RangeError('boom with private text');
        return defaultFactData.getScoreHistory(userId, metric, days, today);
      },
    };
    const { deps, telemetry } = setup([GOOD_DIGEST], { factData });

    const summary = await sweep(deps, a.id, b.id);

    expect(summary).toMatchObject({ usersChecked: 2, generated: 1, failed: 1 });
    expect(await digestsOf(a.id)).toHaveLength(0);
    expect(await digestsOf(b.id)).toHaveLength(1);
    expect(telemetry.named('coach.digest_failed')[0]!.attributes).toEqual({ error: 'RangeError' });
    expect(JSON.stringify(telemetry.events)).not.toContain('private text');
  });

  it('digest telemetry carries ids and counts only, never the digest text', async () => {
    const user = await digestUser();
    const { deps, telemetry } = setup([GOOD_DIGEST]);
    await sweep(deps, user.id);
    const serialized = JSON.stringify(telemetry.events);
    expect(serialized).not.toContain('averaged');
    expect(serialized).not.toContain('bedtime');
    expect(telemetry.events.every((e) => e.userId === user.id && e.personaId === 'mochi')).toBe(true);
  });
});
