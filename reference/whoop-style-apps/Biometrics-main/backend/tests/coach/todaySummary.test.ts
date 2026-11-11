import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import type { Fact, FactSheet } from '../../src/coach/answer/facts';
import {
  SUMMARY_MAX_WORDS,
  TODAY_REQUEST,
  checkSummary,
  generateTodaySummary,
  getTodaySummary,
  templateSentence,
  type TodayDeps,
} from '../../src/coach/answer/today';
import type { EngineSelection } from '../../src/coach/engine';
import type { CoachModelProvider, CoachStreamRequest } from '../../src/coach/model/provider';
import { LEGACY_DISCLAIMER, LEGACY_REPLY_NOTES } from '../../src/coach/answer/history';
import { FakeClock, RecordingTelemetry, createUser, hang, settle } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
});

const NOW = new Date('2026-09-30T12:00:00Z');
const DAY = civilDateToUtcMidnight('2026-09-30');

const facts: Fact[] = [
  { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
  { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
  { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52 },
  { id: 'rhr.today', label: 'Resting heart rate today', value: 61, unit: 'bpm', display: '61 bpm', usual: 55, lowerIsBetter: true },
];
const LOW_DAY: FactSheet = { route: 'today', facts, notes: [] };
const EMPTY: FactSheet = { route: 'today', facts: [], notes: ['No sleep recorded last night'] };

const GOOD = 'Recovery sits at 26 after HRV dipped to 41 ms. Take it easy today and aim for an early night.';
const INVENTED = 'Recovery sits at 73 today. Take it easy.';

type Step = string | Error | 'hang' | ((req: CoachStreamRequest) => Promise<string>);

/** A stream provider that answers each call with the next step. */
function scripted(steps: Step[]) {
  const requests: CoachStreamRequest[] = [];
  let i = 0;
  const provider: CoachModelProvider = {
    id: 'scripted-stream',
    async *stream(req: CoachStreamRequest) {
      requests.push(req);
      const step = steps[i++];
      if (step === undefined) throw new Error('script exhausted');
      if (step === 'hang') await hang();
      if (step instanceof Error) throw step;
      const text = typeof step === 'function' ? await step(req) : step;
      // Stream it in two chunks, as a real provider would.
      yield text.slice(0, 10);
      yield text.slice(10);
    },
  };
  const selection: EngineSelection = { requested: 'local', provider, servedBy: () => 'local' };
  return { requests, selection };
}

async function consentedUser(over: { timezone?: string; coachPersonaId?: string } = {}) {
  const user = await createUser();
  if (Object.keys(over).length > 0) await prisma.user.update({ where: { id: user.id }, data: over });
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

function deps(selection: EngineSelection | null, over: Partial<TodayDeps> = {}): TodayDeps & { clock: FakeClock } {
  const clock = new FakeClock();
  return {
    loadSheet: async () => LOW_DAY,
    now: () => NOW,
    clock,
    budgetMs: 45_000,
    ...(selection ? { selectProvider: async () => selection } : {}),
    ...over,
  } as TodayDeps & { clock: FakeClock };
}

const rowOf = (userId: string) => prisma.coachDaySummary.findUnique({ where: { userId_date: { userId, date: DAY } } });

describe('checkSummary', () => {
  it(`accepts ${SUMMARY_MAX_WORDS} words and rejects one more`, () => {
    const words = (n: number) => `${Array.from({ length: n }, () => 'calm').join(' ')}.`;
    expect(checkSummary(words(SUMMARY_MAX_WORDS), LOW_DAY)).toEqual({ ok: true, text: words(SUMMARY_MAX_WORDS) });
    expect(checkSummary(words(SUMMARY_MAX_WORDS + 1), LOW_DAY)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects an empty reply and an invented number', () => {
    expect(checkSummary('   ', LOW_DAY)).toEqual({ ok: false, reason: 'empty' });
    expect(checkSummary(INVENTED, LOW_DAY)).toEqual({ ok: false, reason: 'unknown_number' });
  });

  it('rejects a draft cut off mid-sentence (no closing punctuation)', () => {
    expect(checkSummary('Recovery sits at 26 after HRV dipped to 41 ms, so you', LOW_DAY)).toEqual({ ok: false, reason: 'cut_off' });
    expect(checkSummary('Rest up today!', LOW_DAY)).toEqual({ ok: true, text: 'Rest up today!' });
  });

  it('looks past a trailing emoji or markdown emphasis for the closing punctuation (R31)', () => {
    for (const text of ['Rest up today. 🌙', 'Rest up *today.*', 'Rest up _today._', 'Take it easy today! 👍🏽']) {
      expect(checkSummary(text, LOW_DAY)).toEqual({ ok: true, text });
    }
    expect(checkSummary('Rest up and get to 🌙', LOW_DAY)).toEqual({ ok: false, reason: 'cut_off' });
    expect(checkSummary('Rest up *today*', LOW_DAY)).toEqual({ ok: false, reason: 'cut_off' });
  });

  it('passes the full mockup paragraph and a "night" sentence, and still rejects a borrowed number (R31)', () => {
    const mockup = "Recovery's 26, about half your usual. A short night (6h 48m) pulled your HRV down to 41. Keep today light and aim for bed by 10:15.";
    expect(checkSummary(mockup, LOW_DAY)).toEqual({ ok: true, text: mockup });
    expect(checkSummary('After a night of 6h 48m, recovery is 26.', LOW_DAY)).toMatchObject({ ok: true });
    expect(checkSummary('Your HRV is 61 after a rough night.', LOW_DAY)).toEqual({ ok: false, reason: 'unknown_number' });
  });

  it("passes the owner's chosen style (\"night\" is a sleep word)", () => {
    const style1 = 'A short night (6h 48m) pulled your HRV down to 41. Keep today gentle and aim for an early night.';
    expect(checkSummary(style1, LOW_DAY)).toEqual({ ok: true, text: style1 });
  });

  it('drops any fenced block and collapses whitespace', () => {
    const raw = `${GOOD.replace('. ', '.\n\n')}\n\`\`\`card\n{"headline":"x"}\n\`\`\``;
    expect(checkSummary(raw, LOW_DAY)).toEqual({ ok: true, text: GOOD });
  });

  it('drops a partial fence left by a max-token cutoff', () => {
    expect(checkSummary(`${GOOD}\n\n\`\``, LOW_DAY)).toEqual({ ok: true, text: GOOD });
    expect(checkSummary(`${GOOD} \``, LOW_DAY)).toEqual({ ok: true, text: GOOD });
  });
});

describe('getTodaySummary', () => {
  it('has no sentence and no bars before any data, and asks for nothing', async () => {
    const user = await consentedUser();
    const onMissing = jest.fn();
    const res = await getTodaySummary(user.id, deps(null, { loadSheet: async () => EMPTY, onMissing }));
    expect(res).toEqual({ date: '2026-09-30', hasData: false, sentence: null, bars: [] });
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('returns the template instantly and asks for a sentence when none is stored', async () => {
    const user = await consentedUser();
    const onMissing = jest.fn();
    const res = await getTodaySummary(user.id, deps(null, { onMissing }));
    expect(res.hasData).toBe(true);
    expect(res.sentence).toEqual({ ...templateSentence(LOW_DAY), source: 'template' });
    expect(res.bars.map((b) => b.metric)).toEqual(['recovery', 'sleep', 'hrv', 'rhr']);
    expect(onMissing).toHaveBeenCalledTimes(1);
  });

  it('returns a stored AI sentence as is', async () => {
    const user = await consentedUser();
    await prisma.coachDaySummary.create({
      data: { userId: user.id, date: DAY, text: GOOD, spans: [{ text: GOOD }], source: 'AI' },
    });
    const onMissing = jest.fn();
    const res = await getTodaySummary(user.id, deps(null, { onMissing }));
    expect(res.sentence).toEqual({ text: GOOD, spans: [{ text: GOOD }], source: 'ai' });
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('a stored TEMPLATE marker serves a fresh template (never stale numbers) and does not retry', async () => {
    const user = await consentedUser();
    await prisma.coachDaySummary.create({
      data: { userId: user.id, date: DAY, text: 'Recovery 70, above your usual 58.', spans: [], source: 'TEMPLATE' },
    });
    const onMissing = jest.fn();
    const res = await getTodaySummary(user.id, deps(null, { onMissing }));
    expect(res.sentence).toEqual({ ...templateSentence(LOW_DAY), source: 'template' });
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("dates the summary in the user's own timezone", async () => {
    const user = await consentedUser({ timezone: 'Pacific/Auckland' });
    const res = await getTodaySummary(user.id, deps(null));
    expect(res.date).toBe('2026-10-01');
  });
});

describe('generateTodaySummary', () => {
  it("stores a validated AI sentence with tappable spans, written from the today fact sheet in the character's voice", async () => {
    const user = await consentedUser({ coachPersonaId: 'kit' });
    const { requests, selection } = scripted([GOOD]);

    expect(await generateTodaySummary(user.id, deps(selection))).toBe('ai');

    const row = await rowOf(user.id);
    expect(row).toMatchObject({ text: GOOD, source: 'AI' });
    expect((row!.spans as Array<{ metric?: string }>).filter((s) => s.metric).map((s) => s.metric)).toEqual(['recovery', 'hrv', 'sleep']); // "an early night" is a sleep mention
    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req!.messages).toEqual([{ role: 'user', content: TODAY_REQUEST }]);
    expect(req!.maxTokens).toBe(300);
    expect(req!.signal).toBeInstanceOf(AbortSignal);
    expect(req!.system).toContain('"Kit"');
    expect(req!.system).toContain('[recovery.today] Recovery today: 26');
    expect(req!.system).toContain(`At most ${SUMMARY_MAX_WORDS} words`);
  });

  it('regenerates once with a corrective note (never resending the rejected draft), then stores the good one', async () => {
    const user = await consentedUser();
    const long = `${Array.from({ length: 50 }, () => 'calm').join(' ')}.`;
    const { requests, selection } = scripted([long, GOOD]);

    expect(await generateTodaySummary(user.id, deps(selection))).toBe('ai');

    expect(requests).toHaveLength(2);
    expect(requests[1]!.messages).toHaveLength(1);
    expect(requests[1]!.messages[0]!.content).toContain(TODAY_REQUEST);
    expect(requests[1]!.messages[0]!.content).toMatch(/45 words or fewer/);
    expect(requests[1]!.messages[0]!.content).not.toContain('calm calm');
    expect((await rowOf(user.id))!.text).toBe(GOOD);
  });

  it('stores the template when both drafts invent a number', async () => {
    const user = await consentedUser();
    const { requests, selection } = scripted([INVENTED, INVENTED]);

    expect(await generateTodaySummary(user.id, deps(selection))).toBe('template');

    expect(requests).toHaveLength(2);
    expect(await rowOf(user.id)).toMatchObject({ text: templateSentence(LOW_DAY).text, source: 'TEMPLATE' });
  });

  it('never adds the disclaimer or a memory note to the sentence, stored or served (the page shows the footnote once)', async () => {
    const appended = [LEGACY_DISCLAIMER, ...LEGACY_REPLY_NOTES];
    const ai = await consentedUser();
    expect(await generateTodaySummary(ai.id, deps(scripted([GOOD]).selection))).toBe('ai');
    const template = await consentedUser();
    expect(await generateTodaySummary(template.id, deps(scripted([new Error('ECONNREFUSED')]).selection))).toBe('template');

    for (const user of [ai, template]) {
      const stored = (await rowOf(user.id))!.text;
      const served = (await getTodaySummary(user.id, deps(null))).sentence!.text;
      for (const text of [stored, served]) for (const extra of appended) expect(text).not.toContain(extra);
    }
  });

  it('stores the template when the model is unreachable', async () => {
    const user = await consentedUser();
    const { selection } = scripted([new Error('ECONNREFUSED')]);
    expect(await generateTodaySummary(user.id, deps(selection))).toBe('template');
    expect((await rowOf(user.id))!.source).toBe('TEMPLATE');
  });

  it('gives up at the budget on a hung model and aborts the call', async () => {
    const user = await consentedUser();
    const { requests, selection } = scripted(['hang']);
    const d = deps(selection);

    const running = generateTodaySummary(user.id, d);
    // Wait (real time: the DB reads before the call are I/O) until the model call is in flight.
    for (let i = 0; i < 400 && requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    await settle();
    expect(requests).toHaveLength(1);
    d.clock.advance(45_000);

    expect(await running).toBe('template');
    expect(requests[0]!.signal!.aborted).toBe(true);
    expect(d.clock.pendingTimers).toBe(0);
  });

  it.each([
    ['the coach is off', 'skipped_disabled'],
    ['there is no coach consent', 'skipped_no_consent'],
  ] as const)('does nothing when %s', async (label, outcome) => {
    const user = label === 'the coach is off' ? await consentedUser() : await createUser();
    if (label === 'the coach is off') process.env.COACH_ENABLED = 'false';
    const { requests, selection } = scripted([GOOD]);
    expect(await generateTodaySummary(user.id, deps(selection))).toBe(outcome);
    expect(requests).toHaveLength(0);
    expect(await rowOf(user.id)).toBeNull();
  });

  it('does nothing without data', async () => {
    const user = await consentedUser();
    const { requests, selection } = scripted([GOOD]);
    expect(await generateTodaySummary(user.id, deps(selection, { loadSheet: async () => EMPTY }))).toBe('skipped_no_data');
    expect(requests).toHaveLength(0);
  });

  it('leaves an existing sentence alone unless forced (the after-sync job forces)', async () => {
    const user = await consentedUser();
    await prisma.coachDaySummary.create({ data: { userId: user.id, date: DAY, text: 'old', spans: [], source: 'AI' } });
    const first = scripted([GOOD]);
    expect(await generateTodaySummary(user.id, deps(first.selection))).toBe('skipped_exists');
    expect(first.requests).toHaveLength(0);

    const forced = scripted([GOOD]);
    expect(await generateTodaySummary(user.id, { ...deps(forced.selection), force: true })).toBe('ai');
    expect((await rowOf(user.id))!.text).toBe(GOOD);
  });

  it('discards a sentence written in the old voice when the character changed mid-generation', async () => {
    const user = await consentedUser({ coachPersonaId: 'mochi' });
    const { selection } = scripted([
      async () => {
        await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'kit' } });
        return GOOD;
      },
    ]);
    expect(await generateTodaySummary(user.id, deps(selection))).toBe('skipped_persona_changed');
    expect(await rowOf(user.id)).toBeNull();
  });

  it('runs once per user when asked twice at the same time', async () => {
    const user = await consentedUser();
    const { requests, selection } = scripted([GOOD, GOOD]);
    const [a, b] = await Promise.all([
      generateTodaySummary(user.id, deps(selection)),
      generateTodaySummary(user.id, deps(selection)),
    ]);
    expect([a, b]).toEqual(['ai', 'ai']);
    expect(requests).toHaveLength(1);
  });
});

// Fix round 1 (R29).
describe('generateTodaySummary: runs asked for while one is in flight', () => {
  const LATER = 'Recovery is 26 today. Keep it gentle and aim for an early night.';

  async function untilCalled(requests: CoachStreamRequest[], n: number) {
    for (let i = 0; i < 400 && requests.length < n; i++) await new Promise((r) => setTimeout(r, 5));
    expect(requests).toHaveLength(n);
  }

  it('a forced run asked for during a lazy run runs after it, and its sentence is the one stored', async () => {
    const user = await consentedUser();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { requests, selection } = scripted([
      async () => {
        await gate;
        return GOOD;
      },
      LATER,
    ]);

    const lazy = generateTodaySummary(user.id, deps(selection));
    const forced = generateTodaySummary(user.id, { ...deps(selection), force: true });
    // A later, unforced caller shares the queued forced run: no third model call.
    const later = generateTodaySummary(user.id, deps(selection));
    await untilCalled(requests, 1);
    release();

    expect(await lazy).toBe('ai');
    expect(await forced).toBe('ai');
    expect(await later).toBe('ai');
    expect(requests).toHaveLength(2);
    expect((await rowOf(user.id))!.text).toBe(LATER);
  });

  it('after a character switch mid-run, the queued rewrite writes in the new voice', async () => {
    const user = await consentedUser({ coachPersonaId: 'mochi' });
    const { requests, selection } = scripted([
      async () => {
        await prisma.user.update({ where: { id: user.id }, data: { coachPersonaId: 'kit' } });
        return GOOD;
      },
      LATER,
    ]);

    const first = generateTodaySummary(user.id, deps(selection));
    const rewrite = generateTodaySummary(user.id, deps(selection));

    expect(await first).toBe('skipped_persona_changed');
    expect(await rewrite).toBe('ai');
    expect(requests).toHaveLength(2);
    expect(requests[1]!.system).toContain('"Kit"');
    expect((await rowOf(user.id))!.text).toBe(LATER);
  });

  it('takes its row back when the character changes between the check and the write', async () => {
    const user = await consentedUser({ coachPersonaId: 'mochi' });
    const { selection } = scripted([GOOD]);
    const original = prisma.coachDaySummary.upsert.bind(prisma.coachDaySummary);
    const spy = jest.spyOn(prisma.coachDaySummary, 'upsert').mockImplementationOnce(((args: Parameters<typeof original>[0]) => {
      return prisma.user
        .update({ where: { id: user.id }, data: { coachPersonaId: 'kit' } })
        .then(() => original(args));
    }) as unknown as typeof prisma.coachDaySummary.upsert);
    try {
      expect(await generateTodaySummary(user.id, deps(selection))).toBe('skipped_persona_changed');
    } finally {
      spy.mockRestore();
    }
    expect(await rowOf(user.id)).toBeNull();
  });
});

describe('generateTodaySummary: failure telemetry and budget (R29)', () => {
  it.each([
    ['both drafts invent a number', [INVENTED, INVENTED] as Step[], 'unknown_number'],
    ['both drafts are cut off', ['Recovery sits at 26 so', 'Recovery sits at 26 so'] as Step[], 'cut_off'],
    ['the model is unreachable', [new Error('ECONNREFUSED')] as Step[], 'model_unavailable'],
  ])('emits coach.summary_failed with the reason when %s (no text)', async (_label, steps, reason) => {
    const user = await consentedUser();
    const telemetry = new RecordingTelemetry();
    const { selection } = scripted(steps);
    expect(await generateTodaySummary(user.id, deps(selection, { telemetry }))).toBe('template');
    expect(telemetry.named('coach.summary_failed')).toEqual([
      { name: 'coach.summary_failed', userId: user.id, personaId: expect.any(String), attributes: { reason, engine: 'local' } },
    ]);
  });

  it('emits timeout when the budget runs out, and nothing on success', async () => {
    const user = await consentedUser();
    const telemetry = new RecordingTelemetry();
    const { requests, selection } = scripted(['hang']);
    const d = deps(selection, { telemetry });
    const running = generateTodaySummary(user.id, d);
    for (let i = 0; i < 400 && requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    await settle();
    d.clock.advance(45_000);
    expect(await running).toBe('template');
    expect(telemetry.named('coach.summary_failed').map((e) => e.attributes.reason)).toEqual(['timeout']);

    const other = await consentedUser();
    const quiet = new RecordingTelemetry();
    expect(await generateTodaySummary(other.id, deps(scripted([GOOD]).selection, { telemetry: quiet }))).toBe('ai');
    expect(quiet.events).toEqual([]);
  });

  it('gives a hosted selection the local budget too, since it may fall back mid-run', async () => {
    const saved = { local: process.env.COACH_LOCAL_BUDGET_MS, hosted: process.env.COACH_HOSTED_BUDGET_MS };
    delete process.env.COACH_LOCAL_BUDGET_MS;
    delete process.env.COACH_HOSTED_BUDGET_MS;
    try {
      const user = await consentedUser();
      const { requests, selection } = scripted(['hang']);
      const hosted: EngineSelection = { ...selection, requested: 'hosted', servedBy: () => 'hosted' };
      const d = deps(hosted, { budgetMs: undefined });
      let done = false;
      const running = generateTodaySummary(user.id, d).finally(() => (done = true));
      for (let i = 0; i < 400 && requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      await settle();

      d.clock.advance(30_000);
      await settle();
      expect(done).toBe(false);
      d.clock.advance(15_000);
      expect(await running).toBe('template');
    } finally {
      for (const [k, v] of [['COACH_LOCAL_BUDGET_MS', saved.local], ['COACH_HOSTED_BUDGET_MS', saved.hosted]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
