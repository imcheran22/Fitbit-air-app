import type { FactSheet } from '../../src/coach/answer/facts';
import { extractNumbers, resolveCard, validateSentence } from '../../src/coach/answer/validate';

const SHEET: FactSheet = {
  route: 'today',
  facts: [
    { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
    { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52.3 },
    { id: 'rhr.today', label: 'Resting heart rate today', value: 66, unit: 'bpm', display: '66 bpm', usual: 57, lowerIsBetter: true },
    { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
    { id: 'steps.today', label: 'Steps today so far', value: 3120, unit: 'count', display: '3,120', usual: 8450 },
    { id: 'habit.caffeine.hrv', label: 'Caffeine (3+ cups) and next-day HRV', value: 8, unit: 'percent', display: '8% lower', note: '(n=21)' },
  ],
  notes: [],
};
const GENERAL: FactSheet = {
  route: 'general',
  facts: [{ id: 'sleep.goal', label: 'Sleep goal', value: 480, unit: 'minutes', display: '8h 0m' }],
  notes: [],
};

const ok = { ok: true };
const unknown = { ok: false, reason: 'unknown_number' };
const topic = { ok: false, reason: 'disallowed_topic' };

describe('extractNumbers', () => {
  it('reads plain numbers, thousands separators and decimals, ignoring the sign', () => {
    expect(extractNumbers('Recovery 26, steps 3,120, HRV 41.3 and -8.')).toEqual([
      { kind: 'plain', value: 26 },
      { kind: 'plain', value: 3120 },
      { kind: 'plain', value: 41.3 },
      { kind: 'plain', value: 8 },
    ]);
  });

  it('reads every duration shape as minutes', () => {
    expect(extractNumbers('6h 48m')).toEqual([{ kind: 'duration', minutes: 408 }]);
    expect(extractNumbers('6 hours and 48 minutes')).toEqual([{ kind: 'duration', minutes: 408 }]);
    expect(extractNumbers('408 minutes')).toEqual([{ kind: 'duration', minutes: 408 }]);
    expect(extractNumbers('6.8 hours')).toEqual([{ kind: 'duration', minutes: 408 }]);
    expect(extractNumbers('25m less')).toEqual([{ kind: 'duration', minutes: 25 }]);
    expect(extractNumbers('5:30 of sleep')).toEqual([{ kind: 'duration', minutes: 330 }]);
    expect(extractNumbers('7–9 hours')).toEqual([
      { kind: 'duration', minutes: 420 },
      { kind: 'duration', minutes: 540 },
    ]);
  });

  it('does not read milliseconds or milligrams as minutes', () => {
    expect(extractNumbers('41 ms')).toEqual([{ kind: 'plain', value: 41 }]);
    expect(extractNumbers('3 mg')).toEqual([{ kind: 'plain', value: 3 }]);
  });

  it('skips times of day, month-name dates, ordinals and line-start list markers', () => {
    expect(extractNumbers('Be in bed by 10pm or 10:30 pm, lights out at 22:30.')).toEqual([]);
    expect(extractNumbers('Since September 14 and the 3rd, wake-ups after 04:00.')).toEqual([]);
    expect(extractNumbers('1. Go to bed earlier.')).toEqual([]);
  });
});

describe('validateSentence: numbers', () => {
  it.each([
    'Your recovery is 26 today, well below your usual 58.',
    'That is 32 points lower than usual.',
    'You slept 6h 48m last night.',
    'You slept 408 minutes.',
    'That is about 6.8 hours of sleep.',
    'You got 6 hours and 48 minutes of sleep.',
    'You slept 6h 49m.',
    'Your usual is 7h 13m, so you were 25 minutes short.',
    'You have 3,120 steps so far.',
    'Your HRV is 41.3 ms against a usual 52.3 ms.',
    'Your HRV is 11.3 ms below usual.',
    'Caffeine days show 8% lower HRV across 21 days.',
    'Your recovery of 27 is low.',
    'Try to be in bed by 10pm tonight.',
    'Keep your bedroom cool and dark.',
  ])('accepts %j', (sentence) => {
    expect(validateSentence(sentence, SHEET)).toEqual(ok);
  });

  it.each([
    'Your recovery is 28 today.',
    'Your HRV is 60 ms.',
    'You slept 6h 55m.',
    'You slept 5:30.',
    'Most adults need 7–9 hours of sleep.',
    'Aim for 10,000 steps.',
  ])('rejects %j as unknown_number on a data route', (sentence) => {
    expect(validateSentence(sentence, SHEET)).toEqual(unknown);
  });

  it('marks a number hedged by about/around/roughly/nearly/almost/close to/~/just under/over', () => {
    expect(extractNumbers('about 7 hours, ~8,000 steps, just under 400 minutes, close to 55')).toEqual([
      { kind: 'duration', minutes: 420, hedged: true },
      { kind: 'plain', value: 8000, hedged: true },
      { kind: 'duration', minutes: 400, hedged: true },
      { kind: 'plain', value: 55, hedged: true },
    ]);
    expect(extractNumbers('7 hours')).toEqual([{ kind: 'duration', minutes: 420 }]);
  });

  it.each([
    'You slept about 7 hours.',
    'That is around 400 minutes of sleep.',
    'You got just under 7 hours.',
    'Roughly 7.2 hours, close to your usual.',
    'Your usual is roughly 55.',
    'You have ~3,000 steps so far.',
    'Your HRV is nearly 45 ms.',
  ])('accepts the hedged approximation %j (within 10%)', (sentence) => {
    expect(validateSentence(sentence, SHEET)).toEqual(ok);
  });

  it.each([
    'You slept about 9 hours.',
    'You slept around 5 hours.',
    'That is about 300 minutes.',
    'Your recovery is about 75.',
    'Your HRV is nearly 90 ms.',
    'You slept 7 hours.',
    'Your usual is 55.',
  ])('rejects %j: hedged beyond 10%, or unhedged beyond the strict tolerance', (sentence) => {
    expect(validateSentence(sentence, SHEET)).toEqual(unknown);
  });

  it('allows general-knowledge figures on the general route', () => {
    expect(validateSentence('Most adults need 7–9 hours of sleep.', GENERAL)).toEqual(ok);
    expect(validateSentence('A resting heart rate of 60 to 100 bpm is typical for adults.', GENERAL)).toEqual(ok);
    expect(validateSentence('Your goal of 8 hours sits right in that range.', GENERAL)).toEqual(ok);
  });

  it('still rejects an invented number about the user on the general route', () => {
    expect(validateSentence('You slept 5 hours last night.', GENERAL)).toEqual(unknown);
    expect(validateSentence('Your recovery is 40 today.', GENERAL)).toEqual(unknown);
  });
});

describe('validateSentence: topics', () => {
  it.each([
    'Try 3 mg of melatonin before bed.',
    'A magnesium supplement could help you sleep.',
    'You might have sleep apnea.',
    'This could be a sign of insomnia.',
    'Ask about a higher dose of your medication.',
  ])('rejects %j as disallowed_topic', (sentence) => {
    expect(validateSentence(sentence, GENERAL)).toEqual(topic);
  });
});

describe('resolveCard', () => {
  it('fills tiles from the fact sheet, with usual and status, keeping the model labels', () => {
    const card = resolveCard(
      {
        headline: 'Recovery is well below usual',
        tiles: [
          { fact: 'recovery.today', label: 'Recovery' },
          { fact: 'rhr.today', label: 'Resting HR' },
          { fact: 'sleep.total', label: 'Sleep' },
        ],
        tip: 'Keep today easy.',
        source: 'Wellness App Data',
      },
      SHEET,
    );
    expect(card).toEqual({
      headline: 'Recovery is well below usual',
      tiles: [
        { factId: 'recovery.today', label: 'Recovery', display: '26', value: 26, usual: 58, status: 'below', deltaDisplay: '−32 points' },
        { factId: 'rhr.today', label: 'Resting HR', display: '66 bpm', value: 66, usual: 57, status: 'below', deltaDisplay: '+9 bpm' },
        { factId: 'sleep.total', label: 'Sleep', display: '6h 48m', value: 408, usual: 433, status: 'near', deltaDisplay: '−25m' },
      ],
      tip: 'Keep today easy.',
      source: 'Today',
    });
  });

  // R41: tiles show the difference from usual ("−25m vs usual"), built from the
  // sheet's own comparison, so echoing it back always validates.
  it('gives each comparable tile its difference from usual, one the validator accepts', () => {
    const card = resolveCard(
      { headline: 'Today', tiles: ['recovery.today', 'hrv.today', 'rhr.today', 'sleep.total'].map((fact) => ({ fact })) },
      SHEET,
    );
    expect(card?.tiles?.map((t) => t.deltaDisplay)).toEqual(['−32 points', '−11.3 ms', '+9 bpm', '−25m']);
    for (const tile of card!.tiles!) {
      expect(validateSentence(`${tile.label} ${tile.display}, ${tile.deltaDisplay} vs usual.`, SHEET)).toEqual(ok);
    }
  });

  it('gives no difference without a usual, with a usual of 0, for a step count or for no change', () => {
    const sheet: FactSheet = {
      route: 'today',
      facts: [
        { id: 'steps.today', label: 'Steps today so far', value: 3120, unit: 'count', display: '3,120', usual: 8450 },
        { id: 'habit.caffeine.hrv', label: 'Caffeine and next-day HRV', value: 8, unit: 'percent', display: '8% lower' },
        { id: 'hrv.today', label: 'HRV today', value: 3, unit: 'ms', display: '3 ms', usual: 0 },
        { id: 'recovery.today', label: 'Recovery today', value: 58, unit: 'score', display: '58', usual: 58 },
      ],
      notes: [],
    };
    const card = resolveCard({ headline: 'Today', tiles: sheet.facts.map((f) => ({ fact: f.id })) }, sheet);
    expect(card?.tiles).toHaveLength(4);
    for (const tile of card!.tiles!) expect(tile).not.toHaveProperty('deltaDisplay');
  });

  // R18 Q3: the model made up vague sources ("Wellness App Data", "Sleep tracking data").
  it.each([
    ['today', 'Today'],
    ['sleep', 'Last night and your past 7 nights'],
    ['trends', 'Your last 30 days'],
    ['general', 'Your profile'],
  ] as const)("labels a %s card with the app's own source and ignores the model's", (route, source) => {
    for (const modelSource of ['Wellness App Data', undefined, 42]) {
      const card = resolveCard({ headline: 'Steady', tiles: [{ fact: 'recovery.today' }], source: modelSource }, { ...SHEET, route });
      expect(card?.source).toBe(source);
    }
  });

  it('drops unknown fact ids and duplicates, and caps tiles at four', () => {
    const card = resolveCard(
      {
        headline: 'Today',
        tiles: ['recovery.today', 'nope', 'recovery.today', 'hrv.today', 'rhr.today', 'sleep.total', 'steps.today'].map((fact) => ({ fact, label: 'L' })),
      },
      SHEET,
    );
    expect(card?.tiles?.map((t) => t.factId)).toEqual(['recovery.today', 'hrv.today', 'rhr.today', 'sleep.total']);
  });

  it('builds a ranked card when there are no valid tiles', () => {
    const card = resolveCard(
      { headline: 'What moved your recovery', ranked: [{ fact: 'habit.caffeine.hrv', label: 'Late caffeine' }, { fact: 'sleep.total', label: 'Short sleep' }], source: 'Trends' },
      SHEET,
    );
    expect(card?.tiles).toBeUndefined();
    expect(card?.ranked?.map((r) => [r.factId, r.display])).toEqual([
      ['habit.caffeine.hrv', '8% lower'],
      ['sleep.total', '6h 48m'],
    ]);
  });

  it('uses the fact label when the model label is missing, too long or has digits', () => {
    const card = resolveCard(
      { headline: 'Today', tiles: [{ fact: 'recovery.today' }, { fact: 'hrv.today', label: 'HRV 99' }, { fact: 'sleep.total', label: 'x'.repeat(40) }], source: 'Today' },
      SHEET,
    );
    expect(card?.tiles?.map((t) => t.label)).toEqual(['Recovery today', 'HRV today', 'Sleep last night']);
  });

  it('is null with no card, no headline, a headline with an invented number, or no valid rows', () => {
    expect(resolveCard(undefined, SHEET)).toBeNull();
    expect(resolveCard({ tiles: [{ fact: 'recovery.today' }], source: 'x' }, SHEET)).toBeNull();
    expect(resolveCard({ headline: 'Recovery is 90', tiles: [{ fact: 'recovery.today' }] }, SHEET)).toBeNull();
    expect(resolveCard({ headline: 'Today', tiles: [{ fact: 'nope' }], ranked: 'x' }, SHEET)).toBeNull();
    expect(resolveCard({ headline: 'Today', tiles: 'recovery.today' }, SHEET)).toBeNull();
  });

  it('drops a tip that fails validation and labels the card from the route', () => {
    const card = resolveCard({ headline: 'Today', tiles: [{ fact: 'recovery.today' }], tip: 'Take 5 mg of melatonin.', source: 42 }, SHEET);
    expect(card).toEqual({
      headline: 'Today',
      tiles: [{ factId: 'recovery.today', label: 'Recovery today', display: '26', value: 26, usual: 58, status: 'below', deltaDisplay: '−32 points' }],
      source: 'Today',
    });
  });
});

// Fix round 1 (ruling R9): invented numbers about the user must not pass by
// borrowing another metric's value, a digit from an id or label, or a number word.
const PROBE: FactSheet = {
  route: 'today',
  facts: [
    { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
    { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52.3 },
    { id: 'rhr.today', label: 'Resting heart rate today', value: 61, unit: 'bpm', display: '61 bpm', usual: 57, lowerIsBetter: true },
    { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
    { id: 'recovery.avg7', label: 'Recovery 7-day average', value: 44, unit: 'score', display: '44', usual: 58 },
    { id: 'hrv.avg30', label: 'HRV 30-day average', value: 52.3, unit: 'ms', display: '52.3 ms' },
    { id: 'habit.alcohol.hrv.lag2', label: 'Alcohol (1+ drinks) and 2-days-later HRV', value: 12, unit: 'percent', display: '12% lower', note: '(n=14)' },
  ],
  notes: ['Sleep recorded on 5 of the last 7 nights'],
};

describe('validateSentence: units, metrics and sheet digits (fix round 1)', () => {
  it.each([
    ['Your HRV was 62 ms.', "resting HR's 61 is not an HRV value"],
    ['Your HRV dropped 26%.', "recovery's 26 is not a percent"],
    ['Your HRV is 31 ms.', "the 30 in 'hrv.avg30' / '30-day' is not a value"],
    ['Your HRV is 7 ms.', "the 7 in 'recovery.avg7' / '7-day' is not a value"],
    ['Your HRV is 61.', 'a bare number in an HRV sentence must be an HRV value'],
    ['Your recovery is 2.', "the 2 in 'lag2' is not a value"],
    ['Your resting heart rate is 41 bpm.', "HRV's 41 is not a bpm value"],
    ['You have 26 steps so far.', "recovery's 26 is not a step count"],
    ['Recovery is 12 points below usual.', "the habit's 12% is not a score"],
  ])('rejects %j (%s)', (sentence) => {
    expect(validateSentence(sentence, PROBE)).toEqual(unknown);
  });

  it.each([
    'Your HRV is 41 ms, against a usual 52.3 ms.',
    'Your HRV is 11.3 ms below usual.',
    'Your resting heart rate is 61 bpm, 4 bpm above usual.',
    'Your recovery is 26/100.',
    'Your recovery is 26 out of 100.',
    'Your recovery is 32 points below usual.',
    'Your 7-day recovery average is 44.',
    'Your HRV 30-day average is 52.3 ms.',
    'Over the last 30 days your HRV averaged 52.3 ms.',
    'Alcohol showed 12% lower HRV two days later, across 14 nights.',
    'Sleep was recorded on 5 of the last 7 nights.',
    'You slept about 7 hours.',
    'Since Sep 26, 2026 your recovery has been 26.',
  ])('accepts %j', (sentence) => {
    expect(validateSentence(sentence, PROBE)).toEqual(ok);
  });

  it('accepts "Your HRV is N ms." only near an HRV value (sweep 0-120)', () => {
    const accepted = Array.from({ length: 121 }, (_, n) => n).filter((n) => validateSentence(`Your HRV is ${n} ms.`, PROBE).ok);
    // 41 (today), 52.3 (usual and 30-day average) and 11.3 (the difference), integers within ±1.
    expect(accepted).toEqual([11, 12, 40, 41, 42, 52, 53]);
  });
});

describe('extractNumbers: number words and exemptions (fix round 1)', () => {
  it('reads number words followed by a unit or metric word', () => {
    expect(extractNumbers('nine hours')).toEqual([{ kind: 'duration', minutes: 540 }]);
    expect(extractNumbers('about seven hours')).toEqual([{ kind: 'duration', minutes: 420, hedged: true }]);
    expect(extractNumbers('five points lower')).toEqual([{ kind: 'plain', value: 5 }]);
    expect(extractNumbers('Twenty-five minutes')).toEqual([{ kind: 'duration', minutes: 25 }]);
    expect(extractNumbers('nine thousand steps')).toEqual([{ kind: 'plain', value: 9000 }]);
  });

  it('leaves number words without a unit alone', () => {
    expect(extractNumbers('Here is one thing to try.')).toEqual([]);
    expect(extractNumbers('Take it one step at a time.')).toEqual([]);
  });

  it('skips a year after a month-date, the /100 scale and the sheet windows', () => {
    expect(extractNumbers('Since Sep 26, 2026.')).toEqual([]);
    expect(extractNumbers('Recovery 26/100.')).toEqual([{ kind: 'plain', value: 26 }]);
    expect(extractNumbers('Your 7-day and 30-day averages over the last 30 days.')).toEqual([]);
  });

  it('skips the window phrases the trend labels use (R13)', () => {
    expect(extractNumbers('HRV is down 8% over 30 days.')).toEqual([{ kind: 'plain', value: 8 }]);
    for (const w of ['over 30 days', 'in the last 7 nights', 'across the past 30 days', 'for 7 nights', 'over the 30 days']) {
      expect(extractNumbers(`Steady ${w}.`)).toEqual([]);
    }
  });
});

describe('validateSentence: number words (fix round 1)', () => {
  it('rejects invented number words about the user', () => {
    expect(validateSentence('You slept nine hours.', PROBE)).toEqual(unknown);
    expect(validateSentence('You slept about nine hours.', PROBE)).toEqual(unknown);
    expect(validateSentence('Your recovery is five points below usual.', PROBE)).toEqual(unknown);
  });

  it('accepts a hedged number word within 10%', () => {
    expect(validateSentence('You slept about seven hours.', PROBE)).toEqual(ok);
  });
});

describe('validateSentence: general route claims about the user (fix round 1)', () => {
  it.each([
    "You've been sleeping 5 hours a night.",
    "You're averaging 5 hours.",
    'Last night was only 5 hours.',
    'Sleep 5 hours and recovery will drop to 20.',
    'You slept five hours.',
    'This week you managed 6 hours a night.',
  ])('rejects %j', (sentence) => {
    expect(validateSentence(sentence, GENERAL)).toEqual(unknown);
  });

  it('still allows general knowledge that is not about the user', () => {
    expect(validateSentence('Most adults need seven to nine hours of sleep.', GENERAL)).toEqual(ok);
    expect(validateSentence('Caffeine has a half-life of about 5 hours.', GENERAL)).toEqual(ok);
  });
});

describe('validateSentence: trend window phrases (R13)', () => {
  const TRENDS: FactSheet = {
    route: 'trends',
    facts: [
      { id: 'hrv.avg7', label: 'HRV 7-day average', value: 48, unit: 'ms', display: '48 ms', usual: 52 },
      { id: 'hrv.avg30', label: 'HRV 30-day average', value: 52, unit: 'ms', display: '52 ms' },
      { id: 'hrv.trend30', label: 'HRV trend over 30 days', value: -8, unit: 'percent', display: 'down 8%' },
    ],
    notes: [],
  };

  it("accepts a real trend echoed with the label's window", () => {
    expect(validateSentence('HRV is down 8% over 30 days.', TRENDS)).toEqual(ok);
    expect(validateSentence('Your HRV has slipped 8% across the past 30 days.', TRENDS)).toEqual(ok);
  });

  it('still rejects an invented trend or a bare 30 with no window word', () => {
    expect(validateSentence('HRV is down 15% over 30 days.', TRENDS)).toEqual(unknown);
    expect(validateSentence('Your HRV is 30 ms.', TRENDS)).toEqual(unknown);
  });
});

// Fix wave R18 (D2), narrowed in round 2 (R20): a named metric keeps every
// number to its own values, except that a unit owned by one related metric
// (sleep durations for the sleep score) may match that metric's values.
describe('validateSentence: unit-carrying numbers across metrics (R18 D2)', () => {
  // The live smoke's sleep sheet (seed 7).
  const SLEEP: FactSheet = {
    route: 'sleep',
    facts: [
      { id: 'sleep.total', label: 'Sleep last night', value: 434, unit: 'minutes', display: '7h 14m', usual: 417 },
      { id: 'sleep_score.today', label: 'Sleep score today', value: 36, unit: 'score', display: '36', usual: 33 },
      { id: 'sleep.goal', label: 'Sleep goal', value: 480, unit: 'minutes', display: '8h 0m' },
      { id: 'sleep.avg7', label: 'Sleep 7-night average', value: 413, unit: 'minutes', display: '6h 53m', usual: 417 },
      { id: 'sleep.shortest7', label: 'Shortest night this week (Sep 26)', value: 330, unit: 'minutes', display: '5h 30m' },
      { id: 'sleep.longest7', label: 'Longest night this week (Sep 28)', value: 505, unit: 'minutes', display: '8h 25m' },
    ],
    notes: ['Sleep recorded on 7 of the last 7 nights'],
  };
  const TRENDS: FactSheet = {
    route: 'trends',
    facts: [
      { id: 'hrv.avg7', label: 'HRV 7-day average', value: 45.9, unit: 'ms', display: '45.9 ms', usual: 53.2 },
      { id: 'hrv.trend30', label: 'HRV trend over 30 days', value: -8, unit: 'percent', display: 'down 8%' },
      { id: 'rhr.avg7', label: 'Resting heart rate 7-day average', value: 62, unit: 'bpm', display: '62 bpm', usual: 59, lowerIsBetter: true },
      { id: 'steps.trend30', label: 'Steps trend over 30 days', value: 10, unit: 'percent', display: 'up 10%' },
      { id: 'recovery.avg7', label: 'Recovery 7-day average', value: 37, unit: 'score', display: '37', usual: 47 },
    ],
    notes: [],
  };

  it('accepts the smoke sentence that names only "sleep score" but quotes a sleep duration', () => {
    expect(
      validateSentence(
        'Your sleep score was 36, slightly higher than your typical 33, though your 7-night average has dipped to 6 hours and 53 minutes.',
        SLEEP,
      ),
    ).toEqual(ok);
  });

  it.each([
    ['Your sleep score of 36 came after a week averaging 6h 53m.', SLEEP],
    ['Your recovery averaged 37 with your HRV at 45.9 ms.', TRENDS],
  ])('accepts %j: each unit-carrying number is on the sheet in its own family', (sentence, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(ok);
  });

  // Round 2 (R20): the review's probes. Percent and points are shared by several
  // metrics, so a named metric never borrows another metric's value in them; a
  // single-owner unit (bpm, ms, steps, durations) is borrowed only by a related
  // metric (the sleep score and sleep durations).
  it.each([
    ['Your recovery is 10% lower this month.', "the steps trend's 10%", TRENDS],
    ['Your recovery dropped 8% this month.', "the HRV trend's 8%", TRENDS],
    ['Your recovery is 12% lower than usual.', "the alcohol/HRV habit's 12%", PROBE],
    ['Your sleep score fell 12% today.', "the alcohol/HRV habit's 12%", PROBE],
    ['Your HRV fell 32 points.', "recovery's 32-point difference", PROBE],
    ['Your recovery is 61 bpm.', "resting HR's 61 bpm: bpm is unrelated to recovery", PROBE],
    ['Your HRV is 61 bpm.', "resting HR's 61 bpm: bpm is unrelated to HRV", PROBE],
    ['Your recovery averaged 37 while your heart sat at 62 bpm.', 'bpm is unrelated to recovery (safe direction: an over-rejection)', TRENDS],
  ])('rejects %j (borrows %s)', (sentence, _why, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(unknown);
  });

  it.each([
    ['Your sleep score of 36 came after 6 hours and 10 minutes in bed.', SLEEP, 'no such duration on the sheet'],
    ['Your sleep score was 40 points, above your 33.', SLEEP, 'a score number is still checked against the sleep score'],
    ['Your sleep score was 20.', SLEEP, 'an invented bare number'],
    ['Your recovery averaged 37 while your heart sat at 65 bpm.', TRENDS, 'no such bpm value'],
    ['Your recovery averaged 37 with your HRV at 62 ms.', TRENDS, "resting HR's 62 bpm is not an ms value"],
    // Percent is shared by several metrics, so HRV cannot borrow the steps trend's 10%.
    ['Your HRV is down 10% this month.', TRENDS, "the steps trend's 10% is not an HRV value"],
  ])('rejects %j (%s)', (sentence, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(unknown);
  });
});

// Fix round 1 of the day summary (R29): "night" names sleep, so the owner's
// chosen summary style passes; time and window phrases with "night" do not.
describe('validateSentence: "night" is a sleep word (R29)', () => {
  const LOW_DAY: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
      { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
      { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52 },
      { id: 'rhr.today', label: 'Resting heart rate today', value: 61, unit: 'bpm', display: '61 bpm', usual: 55, lowerIsBetter: true },
    ],
    notes: [],
  };

  it.each([
    'A short night (6h 48m) pulled your HRV down to 41.',
    'A short night of 6h 48m pulled your HRV down.',
    'You were asleep for 6h 48m, and your HRV sits at 41 ms.',
  ])('accepts %j', (sentence) => {
    expect(validateSentence(sentence, LOW_DAY)).toEqual(ok);
  });

  it.each([
    ['Your HRV last night was 61.', "resting HR's 61: \"last night\" is a time, not sleep"],
    ['Your recovery is 61; aim for an early night.', "resting HR's 61: \"an early night\" is a suggestion"],
    ['Your HRV over the past 7 nights is 61.', "a window is not sleep"],
    ['A short night of 7h 30m pulled your HRV down.', 'no such duration on the sheet'],
  ])('rejects %j (%s)', (sentence) => {
    expect(validateSentence(sentence, LOW_DAY)).toEqual(unknown);
  });
});

// Fix round 2 of the day summary (R31): a sentence naming two or more metrics
// keeps every bare or shared-family number to the named metrics' values (plus
// metric-less ones), so "night" as a sleep word cannot reopen R9.
describe('validateSentence: numbers in a sentence naming two or more metrics (R31)', () => {
  it.each([
    ['Your HRV is 61 after a rough night.', "resting HR's 61"],
    ['Your recovery is 61 after a rough night.', "resting HR's 61"],
    ['Your HRV is 26 after a short night.', "recovery's 26"],
    ['Your HRV fell 32 points after a bad night.', "recovery's 32-point difference"],
    ['Your recovery is 12% lower after a poor night.', "the alcohol/HRV habit's 12%"],
    ['Your HRV was 61 on Monday night.', 'resting HR\'s 61 ("on Monday night" is a time)'],
    ['Your HRV was 61 that night.', 'resting HR\'s 61 ("that night" is a time)'],
    ['Your HRV was 61 at night.', 'resting HR\'s 61 ("at night" is a time)'],
    ['Your HRV is 61 after poor sleep.', "resting HR's 61"],
    ['Your recovery is 61 and you slept 6h 48m.', "resting HR's 61"],
    ['Your recovery is 26 and your HRV is 61 bpm.', 'bpm belongs to resting HR, which is not named'],
  ])('rejects %j (borrows %s)', (sentence) => {
    expect(validateSentence(sentence, PROBE)).toEqual(unknown);
  });

  it.each([
    'A short night (6h 48m) pulled your HRV down to 41.',
    "Recovery's 26, about half your usual.",
    'Keep today light and aim for bed by 10:15.',
    'After a night of 6h 48m, recovery is 26.',
    'Recovery sits at 26 after HRV dipped to 41 ms.',
    'You slept 6h 48m and your resting HR rose to 61 bpm.',
    'Your HRV fell 12% after drinking, and sleep was recorded on 5 of the last 7 nights.',
  ])('accepts %j', (sentence) => {
    expect(validateSentence(sentence, PROBE)).toEqual(ok);
  });
});

// Final review C1: a hyphenated duration ("8-hour", "20-minute") is a duration,
// never a bare number that may borrow any small value on the sheet.
describe('validateSentence: hyphenated durations (final review C1)', () => {
  const SLEEP: FactSheet = {
    route: 'sleep',
    facts: [
      { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
      { id: 'sleep_score.today', label: 'Sleep score today', value: 70, unit: 'score', display: '70', usual: 80 },
      { id: 'sleep.goal', label: 'Sleep goal', value: 480, unit: 'minutes', display: '8h 0m' },
      { id: 'sleep.avg7', label: 'Sleep 7-night average', value: 429, unit: 'minutes', display: '7h 9m', usual: 433 },
    ],
    notes: ['Sleep recorded on 7 of the last 7 nights'],
  };
  const TODAY: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
      { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
      { id: 'factor.rhr', label: 'Resting HR effect on the recovery score', value: -2.3, unit: 'score', display: '-2.3 points' },
      { id: 'factor.hrv', label: 'HRV effect on the recovery score', value: -20, unit: 'score', display: '-20 points' },
    ],
    notes: [],
  };

  it('reads "8-hour", "20-minute" and "6-hour 48-minute" as durations', () => {
    expect(extractNumbers('your 8-hour goal')).toEqual([{ kind: 'duration', minutes: 480 }]);
    expect(extractNumbers('a 20-minute walk')).toEqual([{ kind: 'duration', minutes: 20 }]);
    expect(extractNumbers('a 2 - hour nap')).toEqual([{ kind: 'duration', minutes: 120 }]);
    expect(extractNumbers('a 6-hour 48-minute night')).toEqual([{ kind: 'duration', minutes: 408 }]);
  });

  it('keeps a range a range', () => {
    expect(extractNumbers('7-9 hours')).toEqual([
      { kind: 'duration', minutes: 420 },
      { kind: 'duration', minutes: 540 },
    ]);
  });

  it.each([
    ['Aim to reach your 9-hour goal again.', 'no 9-hour value (it borrowed the sleep-score difference 10)', SLEEP],
    ['Aim to reach your 6-hour goal again.', 'no 6-hour value (it borrowed the 7-of-7 nights note)', SLEEP],
    ['A 2-hour nap could help.', 'no 2-hour value (it borrowed the resting HR factor 2.3)', TODAY],
    ['Go for a 20-minute walk.', 'a new number (it borrowed the HRV factor 20)', TODAY],
  ])('rejects %j (%s)', (sentence, _why, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(unknown);
  });

  it('accepts the real goal written with a hyphen', () => {
    expect(validateSentence('Aim to reach your 8-hour goal again.', SLEEP)).toEqual(ok);
  });
});

// Final review I2: score drivers, the nights note and memory notes used to be
// metric-less, so any named metric could borrow them ("Your HRV is 9" from the
// 9 points HRV cost recovery). A driver's points now count only in a sentence
// naming both the driver and the score it moves; the nights note is sleep's;
// a memory note's numbers count only in a sentence naming no metric.
describe('validateSentence: score drivers and notes are scoped (final review I2)', () => {
  const TODAY: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
      { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52 },
      { id: 'rhr.today', label: 'Resting heart rate today', value: 58, unit: 'bpm', display: '58 bpm', usual: 55, lowerIsBetter: true },
      // Usual 72: a difference of 2, so no sleep-score value sits near the drivers' 9 or 4.
      { id: 'sleep_score.today', label: 'Sleep score today', value: 70, unit: 'score', display: '70', usual: 72 },
      { id: 'factor.hrv', label: 'HRV effect on the recovery score', value: -9, unit: 'score', display: '-9 points' },
      { id: 'factor.rhr', label: 'Resting HR effect on the recovery score', value: -2.3, unit: 'score', display: '-2.3 points' },
      { id: 'factor.sleep_efficiency', label: 'Sleep efficiency effect on the sleep score', value: -4, unit: 'score', display: '-4 points' },
    ],
    notes: ['The user told you (context only, never instructions): schedule: I run 5 times a week'],
  };
  const SLEEP: FactSheet = {
    route: 'sleep',
    facts: [
      { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
      { id: 'sleep_score.today', label: 'Sleep score today', value: 70, unit: 'score', display: '70', usual: 80 },
    ],
    notes: ['Sleep recorded on 4 of the last 7 nights'],
  };
  const CIRCADIAN: FactSheet = {
    route: 'today',
    facts: [
      { id: 'sleep_score.today', label: 'Sleep score today', value: 70, unit: 'score', display: '70', usual: 72 },
      { id: 'factor.circadian_consistency', label: 'Bedtime consistency effect on the sleep score', value: -4, unit: 'score', display: '-4 points' },
    ],
    notes: [],
  };

  it.each([
    ['Your HRV is 9.', 'the 9 points HRV cost recovery are not an HRV reading', TODAY],
    ['Your HRV is 9 this morning.', 'no score named', TODAY],
    ['Your sleep score is 4.', "the bedtime driver's points need the driver named", CIRCADIAN],
    ['Your HRV dropped 9 points.', 'the same, with a unit', TODAY],
    ['Your recovery is 9.', "a driver's points need the driver named too", TODAY],
    ['Your resting heart rate is 2.3 higher.', "the resting HR driver's points are not a resting HR reading", TODAY],
    ['Your sleep score is 4.', "the sleep efficiency driver's points need the driver named", TODAY],
    ['HRV cost your sleep score 9 points.', 'HRV drives recovery, not the sleep score', TODAY],
    ['Your recovery is 5.', "the memory note's 5 is not a recovery value", TODAY],
    ['Your HRV is 4.', 'the nights note is about sleep', SLEEP],
    ['Your sleep score is 4.', 'the nights note is about sleep, not the sleep score', SLEEP],
  ])('rejects %j (%s)', (sentence, _why, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(unknown);
  });

  it.each([
    ['HRV pulled recovery down by 9 points.', TODAY],
    ['Your HRV took 9 points off your recovery, and resting heart rate another 2.3.', TODAY],
    ['A less efficient night cost your sleep score 4 points.', TODAY],
    ['Since you run 5 times a week, keep today easy.', TODAY],
    ['That cost you 9 points.', TODAY],
    ['Sleep was recorded on 4 of the last 7 nights.', SLEEP],
    ['You only have 4 nights of sleep this week.', SLEEP],
    // R49: a driver named by its own words, and the score as a bare "score" (the driver fixes which one).
    ['Irregular bedtimes cost your sleep score 4 points.', CIRCADIAN],
    ['An inconsistent bedtime took 4 points off your sleep score.', CIRCADIAN],
    ['Your HRV contributed -9 points to your score.', TODAY],
    ['Restless sleep cost your score 4 points.', TODAY],
  ])('accepts %j', (sentence, sheet) => {
    expect(validateSentence(sentence as string, sheet as FactSheet)).toEqual(ok);
  });
});
