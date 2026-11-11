import { buildRecapFactSheet } from '../../src/coach/answer/facts';
import { buildRecapLinePrompt, buildRecapStoryPrompt, RecapPromptContext } from '../../src/coach/answer/prompt';
import { ScriptedStreamProvider, StreamStep } from '../../src/coach/model/provider';
import { resolvePersona } from '../../src/coach/personas';
import { checkDraft, RECAP_BUDGET_MS, writeRecapText, RecapTextInput } from '../../src/recap/text';
import type { RecapStats } from '../../src/recap/types';
import { FakeClock } from '../coach/helpers';

const MONTH_STATS: RecapStats = { nightsWithData: 25, avgSleepMinutes: 455, nightsOnGoal: 12, longestOnGoalStreak: 5, avgRecovery: 68, milestones: { streak: { nights: 5 } } };
const WEEK_STATS: RecapStats = { nightsWithData: 6, avgSleepMinutes: 478, nightsOnGoal: 5, longestOnGoalStreak: 2, avgRecovery: 72, bestNight: { date: '2026-09-29', minutesAsleep: 500 } };
const GOOD_LINE = 'Five nights in a row on goal, and 7h 35m a night: lovely work.';
const GOOD_WEEK_LINE = 'You slept 7h 58m a night and hit your goal on 5 nights.';
const GOOD_STORY = 'You hit your goal on 5 nights this week. Recovery averaged 72/100. Keep the same wind-down next week.';

function input(kind: 'WEEK' | 'MONTH', over: Partial<RecapTextInput> = {}): RecapTextInput {
  const stats = kind === 'WEEK' ? WEEK_STATS : MONTH_STATS;
  return { userId: 'u1', kind, stats, sheet: buildRecapFactSheet(kind, stats, 480), persona: resolvePersona('luna'), periodLabel: 'September 2026', aiAllowed: true, ...over };
}
function deps(script: StreamStep[], clock = new FakeClock()) {
  const provider = new ScriptedStreamProvider(script);
  return { provider, clock, deps: { clock, selectProvider: async () => ({ requested: 'local' as const, provider, servedBy: () => 'local' as const }) } };
}

describe('recap prompts', () => {
  const luna = resolvePersona('luna');
  const changed: RecapPromptContext = {
    kind: 'WEEK',
    periodLabel: 'the week of Sep 28',
    sheet: buildRecapFactSheet('WEEK', { ...WEEK_STATS, comparison: { avgSleepDelta: 28, bedtimeSpreadDelta: 0, avgRecoveryDelta: -5 } }, 480),
  };

  it('tell the coach to write every number as digits, scores as N/100 and counts with their noun right after', () => {
    for (const prompt of [buildRecapLinePrompt(luna, changed), buildRecapStoryPrompt(luna, changed)]) {
      expect(prompt).toMatch(/every number as digits/i);
      expect(prompt).toMatch(/no number words/i);
      expect(prompt).toMatch(/no ordinals \(not "fifth"/i);
      expect(prompt).toContain('"N/100"');
      expect(prompt).toMatch(/"N nights", "N days" or "N times", with the noun right after the number/);
    }
  });

  it('state the direction of every comparison in words, with its sign', () => {
    for (const prompt of [buildRecapLinePrompt(luna, changed), buildRecapStoryPrompt(luna, changed)]) {
      expect(prompt).toContain('- Average sleep compared with last week: went UP (a positive change): 28m more than last week.');
      expect(prompt).toContain('- Average recovery compared with last week: went DOWN (a negative change): 5 points lower than last week.');
      expect(prompt).toContain('- Bedtime spread compared with last week: did not change: bedtimes varied the same as last week.');
      expect(prompt).toMatch(/keep that direction exactly/i);
    }
    const noComparison = buildRecapStoryPrompt(luna, { ...changed, sheet: buildRecapFactSheet('WEEK', WEEK_STATS, 480) });
    expect(noComparison).not.toContain('went UP');
    expect(noComparison).not.toContain('Changes since last');
  });

  it("set the story's length from the persona verbosity, clamped to 3-5 sentences; the line stays 1-2 sentences", () => {
    expect(buildRecapStoryPrompt({ ...luna, verbosity: 'terse' }, changed)).toContain('Write 3 sentences in one paragraph.');
    expect(buildRecapStoryPrompt({ ...luna, verbosity: 'normal' }, changed)).toContain('Write 3 to 4 sentences in one paragraph.');
    expect(buildRecapStoryPrompt({ ...luna, verbosity: 'detailed' }, changed)).toContain('Write 4 to 5 sentences in one paragraph.');
    const line = buildRecapLinePrompt({ ...luna, verbosity: 'detailed' }, changed);
    expect(line).toContain('1 or 2 sentences, at most 30 words');
    expect(line).not.toContain('4 to 5 sentences');
  });
});

describe('checkDraft', () => {
  const sheet = buildRecapFactSheet('MONTH', MONTH_STATS, 480);
  it('accepts a draft whose every sentence passes the exact check, and drops a card fence', () => {
    expect(checkDraft(`${GOOD_LINE}\n\`\`\`card\n{}\n\`\`\``, sheet, { maxWords: 30, maxSentences: 2 })).toEqual({ ok: true, text: GOOD_LINE });
  });
  it('rejects a wrong number, too many words or sentences, and an empty draft', () => {
    expect(checkDraft('You were on goal 13 nights.', sheet)).toEqual({ ok: false, reason: 'unknown_number' });
    expect(checkDraft(`${'word '.repeat(31)}done.`, sheet, { maxWords: 30 })).toEqual({ ok: false, reason: 'too_long' });
    expect(checkDraft('One. Two. Three.', sheet, { maxSentences: 2 })).toEqual({ ok: false, reason: 'too_long' });
    expect(checkDraft('  ', sheet)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('writeRecapText', () => {
  it('stores an accepted AI line, in the persona voice with the exact-number rules in the prompt', async () => {
    const t = deps([GOOD_LINE]);
    expect(await writeRecapText(input('MONTH'), t.deps)).toEqual({ line: GOOD_LINE, lineSource: 'AI', story: null, storySource: null });
    const system = t.provider.requests[0]!.system;
    expect(system).toContain('Luna');
    expect(system).toContain('/100');
    expect(system).toContain('[sleep.streak]');
    expect(system).toMatch(/keep that direction exactly/i);
  });

  it('retries once with a corrective note (never resending the draft), then uses the template', async () => {
    const t = deps(['You were on goal 13 nights.', 'Still 13 nights.']);
    const out = await writeRecapText(input('MONTH'), t.deps);
    expect(out.lineSource).toBe('TEMPLATE');
    expect(out.line).toBe('You reached your sleep goal on 12 of 25 nights this month. Your best run was 5 nights on goal in a row.');
    expect(t.provider.callCount).toBe(2);
    const retry = t.provider.requests[1]!.messages[0]!.content;
    expect(retry).toMatch(/number that is not in the facts/);
    expect(retry).not.toContain('13 nights');
  });

  it('accepts a good second draft', async () => {
    const t = deps(['Thirteen nights!? You were on goal 13 nights.', GOOD_LINE]);
    expect((await writeRecapText(input('MONTH'), t.deps)).lineSource).toBe('AI');
  });

  it('makes no model call when AI is not allowed: template line, no story', async () => {
    const t = deps([]);
    const out = await writeRecapText(input('WEEK', { aiAllowed: false }), t.deps);
    expect(out).toMatchObject({ lineSource: 'TEMPLATE', story: null, storySource: null });
    expect(t.provider.callCount).toBe(0);
  });

  it('writes the weekly story too, falling back to the template story after two bad drafts', async () => {
    const good = deps([GOOD_WEEK_LINE, GOOD_STORY]);
    expect(await writeRecapText(input('WEEK'), good.deps)).toEqual({ line: GOOD_WEEK_LINE, lineSource: 'AI', story: GOOD_STORY, storySource: 'AI' });
    const bad = deps([GOOD_WEEK_LINE, 'You slept 9h.', 'You slept 9h.']);
    const out = await writeRecapText(input('WEEK'), bad.deps);
    expect(out.storySource).toBe('TEMPLATE');
    expect(out.story!.startsWith("Here's your week.")).toBe(true);
  });

  it('falls back on a provider error', async () => {
    const t = deps([new Error('down')]);
    expect((await writeRecapText(input('MONTH'), t.deps)).lineSource).toBe('TEMPLATE');
  });

  it('gives up at the 60 s budget, aborts the call and leaves no timer behind', async () => {
    let aborted = false;
    const hang: StreamStep = (request) =>
      (async function* () {
        await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => { aborted = true; resolve(); }));
        yield '';
      })();
    const t = deps([hang]);
    const running = writeRecapText(input('MONTH'), t.deps);
    await new Promise((r) => setImmediate(r));
    t.clock.advance(RECAP_BUDGET_MS);
    expect((await running).lineSource).toBe('TEMPLATE');
    expect(aborted).toBe(true);
    expect(t.clock.pendingTimers).toBe(0);
  });
});
