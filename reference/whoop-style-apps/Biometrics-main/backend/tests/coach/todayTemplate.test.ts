import type { Fact, FactSheet } from '../../src/coach/answer/facts';
import { formatValue } from '../../src/coach/answer/facts';
import { buildBars, buildTodaySummaryPrompt, spansFor, templateSentence } from '../../src/coach/answer/today';
import { disallowedTopics } from '../../src/coach/answer/prompt';
import { REQUIRED_DISALLOWED_TOPICS, resolvePersona } from '../../src/coach/personas';

const recovery = (value: number, usual?: number): Fact => ({
  id: 'recovery.today',
  label: 'Recovery today',
  value,
  unit: 'score',
  display: String(value),
  ...(usual !== undefined ? { usual } : {}),
});
const sleep = (value: number, usual?: number): Fact => ({
  id: 'sleep.total',
  label: 'Sleep last night',
  value,
  unit: 'minutes',
  display: formatValue('minutes', value),
  ...(usual !== undefined ? { usual } : {}),
});
const hrv = (value: number, usual?: number): Fact => ({
  id: 'hrv.today',
  label: 'HRV today',
  value,
  unit: 'ms',
  display: `${value} ms`,
  ...(usual !== undefined ? { usual } : {}),
});
const rhr = (value: number, usual?: number): Fact => ({
  id: 'rhr.today',
  label: 'Resting heart rate today',
  value,
  unit: 'bpm',
  display: `${value} bpm`,
  lowerIsBetter: true,
  ...(usual !== undefined ? { usual } : {}),
});
const sheet = (...facts: Fact[]): FactSheet => ({ route: 'today', facts, notes: [] });

/** The spec's example day: recovery well below usual, HRV the biggest drag. */
const LOW_DAY = sheet(recovery(26, 58), sleep(408, 433), hrv(41, 52), rhr(61, 55));

const joined = (spans: { text: string }[]) => spans.map((s) => s.text).join('');

describe('buildBars', () => {
  it('returns the four bars in order with status, usual and scale', () => {
    expect(buildBars(LOW_DAY)).toEqual([
      { metric: 'recovery', label: 'Recovery', value: 26, usual: 58, unit: 'score', display: '26', usualDisplay: '58', status: 'below', scaleMax: 100 },
      { metric: 'sleep', label: 'Sleep', value: 408, usual: 433, unit: 'minutes', display: '6h 48m', usualDisplay: '7h 13m', status: 'near', scaleMax: 607 },
      { metric: 'hrv', label: 'HRV', value: 41, usual: 52, unit: 'ms', display: '41 ms', usualDisplay: '52 ms', status: 'below', scaleMax: 73 },
      // Higher resting HR is worse: 61 vs 55 is "below" (rose), not "above".
      { metric: 'rhr', label: 'Resting HR', value: 61, usual: 55, unit: 'bpm', display: '61 bpm', usualDisplay: '55 bpm', status: 'below', scaleMax: 86 },
    ]);
  });

  it('scales to 1.4 x the larger of value and usual, rounded up to a whole unit', () => {
    expect(buildBars(sheet(hrv(45, 50)))[0]!.scaleMax).toBe(70);
    expect(buildBars(sheet(hrv(80, 50)))[0]!.scaleMax).toBe(112);
    // 1.4 * 45 is 62.99999999999999 in floating point: still 63.
    expect(buildBars(sheet(hrv(40, 45)))[0]!.scaleMax).toBe(63);
  });

  it('keeps recovery on 0-100 whatever the value', () => {
    expect(buildBars(sheet(recovery(99, 40)))[0]!.scaleMax).toBe(100);
  });

  it('treats resting HR within 10% as near and lower-than-usual as above', () => {
    expect(buildBars(sheet(rhr(50, 55)))[0]!.status).toBe('near');
    expect(buildBars(sheet(rhr(48, 55)))[0]!.status).toBe('above');
  });

  it('a metric with no usual yet has no status and no tick', () => {
    expect(buildBars(sheet(hrv(41)))[0]).toMatchObject({ usual: null, usualDisplay: null, status: null, scaleMax: 58 });
  });

  it('treats a 0 sleep, HRV or resting HR reading as missing, but keeps a recovery of 0', () => {
    expect(buildBars(sheet(sleep(0, 433), hrv(0), rhr(0, 55)))).toEqual([]);
    expect(buildBars(sheet(recovery(0, 58)))).toEqual([
      { metric: 'recovery', label: 'Recovery', value: 0, usual: 58, unit: 'score', display: '0', usualDisplay: '58', status: 'below', scaleMax: 100 },
    ]);
  });

  it('treats a usual of 0 as no usual: no tick, no "0 ms", no status', () => {
    expect(buildBars(sheet(hrv(41, 0)))[0]).toMatchObject({ usual: null, usualDisplay: null, status: null, scaleMax: 58 });
    expect(buildBars(sheet(sleep(408, 0)))[0]).toMatchObject({ usual: null, usualDisplay: null, status: null, scaleMax: 572 });
  });

  it('never has a scale below 1', () => {
    expect(buildBars(sheet(hrv(0.3)))[0]!.scaleMax).toBe(1);
    expect(buildBars(sheet(hrv(0.3, 0)))[0]!.scaleMax).toBe(1);
  });

  it('skips missing metrics and ignores other facts', () => {
    const bars = buildBars(sheet({ id: 'habit.caffeine_late', label: 'x', value: -8, unit: 'score', display: '-8' }, sleep(400, 420)));
    expect(bars.map((b) => b.metric)).toEqual(['sleep']);
    expect(buildBars(sheet())).toEqual([]);
  });
});

describe('templateSentence', () => {
  it('states recovery against usual, then the biggest driver in the same direction', () => {
    const t = templateSentence(LOW_DAY);
    expect(t.text).toBe('Recovery 26, below your usual 58. HRV 41 ms is lower than your usual 52 ms.');
    expect(t.spans).toEqual([
      { text: 'Recovery 26', metric: 'recovery' },
      { text: ', below your usual 58. ' },
      { text: 'HRV 41 ms', metric: 'hrv' },
      { text: ' is lower than your usual 52 ms.' },
    ]);
  });

  it('uses "shorter/longer" for sleep and picks resting HR when it is the driver', () => {
    const t = templateSentence(sheet(recovery(40, 60), sleep(300, 440), hrv(50, 52)));
    expect(t.text).toBe('Recovery 40, below your usual 60. Sleep 5h 0m is shorter than your usual 7h 20m.');
    const r = templateSentence(sheet(recovery(40, 60), hrv(50, 52), rhr(66, 55)));
    expect(r.text).toBe('Recovery 40, below your usual 60. Resting HR 66 bpm is higher than your usual 55 bpm.');
  });

  it('says near, and notes when everything else is close to usual', () => {
    const t = templateSentence(sheet(recovery(60, 58), sleep(430, 433), hrv(51, 52), rhr(55, 55)));
    expect(t.text).toBe('Recovery 60, near your usual 58. Sleep, HRV and resting HR are all close to usual.');
    expect(t.spans[0]).toEqual({ text: 'Recovery 60', metric: 'recovery' });
  });

  it('handles a recovery with no usual yet', () => {
    expect(templateSentence(sheet(recovery(60))).text).toBe('Recovery 60 today.');
  });

  it('leads with the first available metric when recovery is missing', () => {
    expect(templateSentence(sheet(sleep(408, 433))).text).toBe('Sleep 6h 48m today.');
  });

  it('handles a recovery with no usual yet, followed by the biggest driver', () => {
    const t = templateSentence(sheet(recovery(60), sleep(430, 433), hrv(41, 52)));
    expect(t.text).toBe('Recovery 60 today. HRV 41 ms is lower than your usual 52 ms.');
    expect(t.spans).toEqual([
      { text: 'Recovery 60', metric: 'recovery' },
      { text: ' today. ' },
      { text: 'HRV 41 ms', metric: 'hrv' },
      { text: ' is lower than your usual 52 ms.' },
    ]);
  });

  it('never names a 0 reading as the driver', () => {
    const t = templateSentence(sheet(recovery(30, 58), sleep(0, 433), hrv(41, 52)));
    expect(t.text).toBe('Recovery 30, below your usual 58. HRV 41 ms is lower than your usual 52 ms.');
  });

  it('states a recovery of 0', () => {
    expect(templateSentence(sheet(recovery(0, 58))).text).toBe('Recovery 0, below your usual 58.');
  });

  it('is empty with no data', () => {
    expect(templateSentence(sheet())).toEqual({ text: '', spans: [] });
  });

  it.each([
    ['low day', LOW_DAY],
    ['near day', sheet(recovery(60, 58), sleep(430, 433))],
    ['no usual', sheet(recovery(60), hrv(41))],
  ])('spans always rebuild the exact text (%s)', (_label, s) => {
    const t = templateSentence(s);
    expect(joined(t.spans)).toBe(t.text);
  });
});

describe('spansFor (AI sentence)', () => {
  it('marks the first mention of each metric and rebuilds the text exactly', () => {
    const text = 'You slept 6h 48m and your HRV dipped to 41 ms, so recovery sits at 26. Keep today easy; your resting heart rate agrees.';
    const spans = spansFor(text);
    expect(joined(spans)).toBe(text);
    expect(spans.filter((s) => s.metric)).toEqual([
      { text: 'slept', metric: 'sleep' },
      { text: 'HRV', metric: 'hrv' },
      { text: 'recovery', metric: 'recovery' },
      { text: 'resting heart rate', metric: 'rhr' },
    ]);
  });

  it.each([
    ['A short night (6h 48m) pulled recovery to 26; rest HR 61 bpm agrees.', [['night', 'sleep'], ['recovery', 'recovery'], ['rest HR', 'rhr']]],
    ['Your resting HR rose after sleeping 5h 0m.', [['resting HR', 'rhr'], ['sleeping', 'sleep']]],
    ['Your heart rate variability dipped to 41 ms.', [['heart rate variability', 'hrv']]],
    ['Your max heart rate peaked at 172 bpm after sleeping 5h 0m.', [['sleeping', 'sleep']]],
    ['You were asleep by 11; resting HR is 55 bpm.', [['asleep', 'sleep'], ['resting HR', 'rhr']]],
    ['Two short nights in a row show in your HRV.', [['nights', 'sleep'], ['HRV', 'hrv']]],
  ])('marks the wider metric words and rebuilds the text (%s)', (text, expected) => {
    const spans = spansFor(text);
    expect(joined(spans)).toBe(text);
    expect(spans.filter((s) => s.metric)).toEqual(expected.map(([t, metric]) => ({ text: t, metric })));
  });

  it('is one plain span when no metric is named', () => {
    expect(spansFor('Take it easy today.')).toEqual([{ text: 'Take it easy today.' }]);
  });
});

describe('buildTodaySummaryPrompt: disallowed topics (final review M3)', () => {
  it('adds the required topics a persona omits, through the same helper as the answer prompt', () => {
    const persona = { ...resolvePersona(null), disallowedTopics: ['politics'] };
    const sheet: FactSheet = { route: 'today', facts: [recovery(26, 58)], notes: [] };
    const p = buildTodaySummaryPrompt(persona, sheet, '2026-09-30');
    for (const t of disallowedTopics(persona)) expect(p).toContain(JSON.stringify(t));
    expect(disallowedTopics(persona)).toEqual(['politics', ...REQUIRED_DISALLOWED_TOPICS]);
  });
});
