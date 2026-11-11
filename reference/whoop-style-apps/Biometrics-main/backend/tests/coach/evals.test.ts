// The CI gate for the coach eval harness (spec 2026-09-30, section 7): every
// fixture runs through the real answer pipeline with a ScriptedStreamProvider,
// and the must-fail fixtures must be caught on their named check. Also
// unit-tests the direction, attribution and quality checkers on their own.
// Hermetic: no network and no model (the real-model run is
// `npm run eval:coach:local`, never part of this suite).

import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { checkAttribution } from '../../evals/coach/attributionCheck';
import { checkDirectionalClaims, directionOf, extractDirectionalClaims } from '../../evals/coach/directionCheck';
import { FIXTURES, NEGATIVE_FIXTURES } from '../../evals/coach/fixtures';
import { LOW_DAY } from '../../evals/coach/fixtures/common';
import { checkQuality, isNextStep, isStockCheckIn } from '../../evals/coach/qualityCheck';
import { runEval, runFixture, runNegativeFixtures } from '../../evals/coach/runner';
import type { EvalFixture, NegativeFixture } from '../../evals/coach/types';
import type { FactSheet } from '../../src/coach/answer/facts';
import { routeQuestion } from '../../src/coach/answer/route';
import { validateSentence } from '../../src/coach/answer/validate';
import { listPersonas } from '../../src/coach/personas';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('directional-claim checker', () => {
  it('reads the direction of a fact against its usual', () => {
    expect(directionOf({ value: 26, usual: 58 })).toBe('lower');
    expect(directionOf({ value: 58, usual: 55 })).toBe('higher');
    expect(directionOf({ value: 41, usual: 41 })).toBe('unchanged');
    expect(directionOf({ value: 41 })).toBeNull();
  });

  it('passes prose that agrees, and a reply with no directional language at all', () => {
    expect(checkDirectionalClaims('Recovery is 26, well under your usual 58.', 'lower').ok).toBe(true);
    expect(checkDirectionalClaims('Right where you usually are, nice and steady.', 'unchanged').ok).toBe(true);
    expect(checkDirectionalClaims('Try an earlier bedtime.', 'lower').ok).toBe(true);
  });

  it.each([
    ['higher than usual', 'lower'],
    ['above your usual', 'lower'],
    ['improved on usual', 'unchanged'],
    ['lower than usual', 'higher'],
    ['below your usual', 'higher'],
    ['the same as usual', 'higher'],
  ] as const)('fails "%s" against a fact that is %s', (phrase, grounded) => {
    const check = checkDirectionalClaims(`Your recovery is 26, ${phrase}.`, grounded);
    expect(check.ok).toBe(false);
    expect(check.contradictions.length).toBeGreaterThan(0);
  });

  it('is whole-word and case-insensitive', () => {
    expect(extractDirectionalClaims('Your update is HIGHER, thoughtfully.').map((c) => c.word)).toEqual(['higher']);
  });
});

describe('attribution checker', () => {
  const SHEET: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
      { id: 'hrv.today', label: 'HRV today', value: 41, unit: 'ms', display: '41 ms', usual: 52 },
      { id: 'sleep.total', label: 'Sleep last night', value: 408, unit: 'minutes', display: '6h 48m', usual: 433 },
      { id: 'factor.hrv', label: 'HRV effect on the recovery score', value: -9, unit: 'score', display: '-9 points' },
    ],
    notes: [],
  };

  it('passes numbers that belong to the metric the sentence names, in any unit spelling or hedge', () => {
    expect(checkAttribution(['Your HRV is 41 ms, usually 52 ms.', 'You slept about 7 hours.', 'Recovery is 26, 32 lower than usual.'], SHEET).ok).toBe(true);
  });

  it('fails a real number pinned on the wrong metric', () => {
    const check = checkAttribution(['Your HRV is 58 ms today.'], SHEET);
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual([{ sentence: 'Your HRV is 58 ms today.', metric: 'hrv' }]);
  });

  it("catches a score driver's points read as the metric's own value, as the runtime now does too (final review I2)", () => {
    // The 9 points HRV cost the recovery score are not an HRV reading.
    expect(validateSentence('Your HRV is 9 this morning.', SHEET).ok).toBe(false);
    expect(checkAttribution(['Your HRV is 9 this morning.'], SHEET).problems).toEqual([{ sentence: 'Your HRV is 9 this morning.', metric: 'hrv' }]);
  });

  it('does not judge a sentence naming no metric or several', () => {
    expect(checkAttribution(['That is 58 in total.', 'Recovery 58 and HRV 26 moved together.'], SHEET).ok).toBe(true);
  });
});

describe('quality checker (the owner\'s bar: informative, personable, not automated)', () => {
  const SHEET: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 26, unit: 'score', display: '26', usual: 58 },
      { id: 'factor.hrv', label: 'HRV effect on the recovery score', value: -9, unit: 'score', display: '-9 points' },
      { id: 'factor.rhr', label: 'Resting heart rate effect on the recovery score', value: -2.3, unit: 'score', display: '-2.3 points' },
    ],
    notes: [],
  };
  const GOOD = [
    'Your recovery is 26 today, well under your usual 58.',
    'A lower HRV and a higher resting heart rate pulled it down most.',
    'Keep today to an easy walk and protect your bedtime tonight.',
  ];

  it('passes a reply that answers first, names every driver and ends on a concrete step in words', () => {
    expect(checkQuality(GOOD, SHEET, { answersFirst: ['recovery'], namesDrivers: true, nextStep: true, noStockCheckIn: true })).toEqual([]);
  });

  it('fails a reply that buries the answer behind filler', () => {
    expect(checkQuality(['Great question!', ...GOOD], SHEET, { answersFirst: ['recovery'] })).toEqual([
      expect.stringContaining('first sentence does not answer the question'),
    ]);
  });

  it('fails a reply that names only one of the drivers', () => {
    const problems = checkQuality(['Your recovery is 26, pulled down by your HRV.'], SHEET, { namesDrivers: true });
    expect(problems).toEqual([expect.stringContaining('Resting heart rate')]);
  });

  it('wants the next step in words: a step carrying a new number does not count', () => {
    expect(isNextStep('Try an easy walk today.')).toBe(true);
    expect(isNextStep('You could go to bed by 10pm tonight.')).toBe(true);
    expect(isNextStep('Aim for 9 hours tonight.')).toBe(false);
    expect(isNextStep('Let us take a look at the data.')).toBe(false);
    expect(checkQuality(['Your recovery is 26.'], SHEET, { nextStep: true })).toEqual([expect.stringContaining('no concrete next step')]);
  });

  it('flags a stock check-in question', () => {
    expect(checkQuality([...GOOD, 'How have you been feeling lately?'], SHEET, { noStockCheckIn: true })).toEqual([
      expect.stringContaining('stock check-in'),
    ]);
    expect(checkQuality([...GOOD, 'Is your long run still on for Saturday?'], SHEET, { noStockCheckIn: true })).toEqual([]);
  });
});

// The real phase-1 transcripts (task B13 fix wave report, section 6.4), verbatim:
// what the owner disliked must be flagged and what was praised must pass.
describe('quality checker on the real B13 transcripts', () => {
  const TODAY: FactSheet = {
    route: 'today',
    facts: [
      { id: 'recovery.today', label: 'Recovery today', value: 39, unit: 'score', display: '39', usual: 47 },
      { id: 'hrv.today', label: 'HRV today', value: 50.1, unit: 'ms', display: '50.1 ms', usual: 53.2 },
      { id: 'rhr.today', label: 'Resting heart rate today', value: 61, unit: 'bpm', display: '61 bpm', usual: 59, lowerIsBetter: true },
      { id: 'sleep.total', label: 'Sleep last night', value: 434, unit: 'minutes', display: '7h 14m', usual: 417 },
      { id: 'steps.today', label: 'Steps today so far', value: 9645, unit: 'count', display: '9,645', usual: 7781 },
      { id: 'factor.sleep_debt', label: 'Sleep debt effect on the recovery score', value: -6.3, unit: 'score', display: '-6.3 points' },
      { id: 'factor.hrv', label: 'HRV effect on the recovery score', value: -2.1, unit: 'score', display: '-2.1 points' },
    ],
    notes: [],
  };
  const TRENDS: FactSheet = {
    route: 'trends',
    facts: [
      { id: 'hrv.avg7', label: 'HRV 7-day average', value: 45.9, unit: 'ms', display: '45.9 ms', usual: 53.2 },
      { id: 'hrv.avg30', label: 'HRV 30-day average', value: 53.2, unit: 'ms', display: '53.2 ms' },
      { id: 'hrv.trend30', label: 'HRV trend over 30 days', value: -8, unit: 'percent', display: '8% down' },
      { id: 'habit.alcohol.hrv', label: 'Alcohol (1+ drinks) and next-day HRV', value: 17, unit: 'percent', display: '17% lower', note: '(n=21)' },
    ],
    notes: [],
  };

  const B_BEFORE = [
    'Your recovery score is 39, which is 8 points lower than your usual 47.',
    'This dip is largely driven by a sleep debt that has cost you 6.3 points toward your recovery score.',
    'Have you noticed any specific stressors or late nights over the past few days?',
  ];
  const B_AFTER = [
    'Your recovery score of 39 is lower than your usual 47, driven by a sleep debt effect of -6.3 points despite sleeping 17 minutes longer than average last night.',
    'This is compounded by an HRV reading of 50.1 ms, which is 3.1 ms below your typical 53.2 ms, and a resting heart rate of 61 bpm that sits 2 bpm higher than your usual 59 bpm.',
    'To help your body bounce back, try prioritizing gentle movement or rest today rather than intense training.',
    'Do you feel physically tired or just mentally drained?',
  ];
  const C_AFTER_STEP =
    'Given your recovery score of 39 is 8 points lower than usual and your resting heart rate is elevated at 61 bpm, it is best to prioritize active recovery over intense training today.';
  const E_BEFORE = [
    'Yes, your HRV has trended down by 8% over the last 30 days, with your current 7-day average at 45.9 ms compared to your usual 53.2 ms.',
    'This decline often signals that your body is under more stress or needs more recovery time than it is currently getting.',
    'Have you noticed any changes in your daily routine or stress levels recently?',
  ];
  const E_AFTER = [
    'Yes, your HRV has trended down by 8% over the last 30 days, with your current 7-day average at 45.9 ms compared to your usual 53.2 ms.',
    'This decline coincides with a slight dip in your sleep duration and an increase in your resting heart rate, suggesting your body is under more physiological stress than usual.',
    'To help stabilize your HRV, consider reducing alcohol intake, as your data shows it lowers next-day HRV by 17%.',
    'Would you like to review which recent days had the most significant drops?',
  ];

  it.each([
    'Since you are aiming for a goal of 8 hours, do you feel rested enough tonight to try getting in bed a bit earlier?', // a before
    'Would you like to look at what might have contributed to that variability?', // a after
    'Have you noticed any specific stressors or late nights over the past few days?', // b before
    'Do you feel physically tired or just mentally drained?', // b after
    'Would you like to swap some of that activity for a gentle walk or stretching session instead?', // c before
    'Would you prefer a guided relaxation session or just some quiet time to let your body recover?', // c after
    'Would you like to explore small adjustments to help bridge that gap?', // d before
    'Have you noticed any changes in your daily routine or stress levels recently?', // e before
    'Would you like to review which recent days had the most significant drops?', // e after
    'How are you doing?',
  ])('flags the stock or app-action question %j', (q) => {
    expect(checkQuality(['Your recovery is 39 today.', q], TODAY, { noStockCheckIn: true })).toEqual([expect.stringContaining('stock check-in')]);
  });

  it('passes a specific question back that would change the advice', () => {
    expect(isStockCheckIn('Is your long run still on for this weekend?')).toBe(false);
    expect(isStockCheckIn('How are you doing.')).toBe(false); // only questions are judged
    // A feeling question anchored on a concrete event is specific (C2 minor); an offer never is.
    expect(isStockCheckIn("Do you feel any soreness from Saturday's long run?")).toBe(false);
    expect(isStockCheckIn('Are you feeling the hills from your run yesterday?')).toBe(false);
    expect(isStockCheckIn('Would you prefer to skip your run on Saturday?')).toBe(true);
    expect(checkQuality(['Your recovery is 39 today.', 'Is your long run still on for this weekend?'], TODAY, { noStockCheckIn: true })).toEqual([]);
  });

  it('counts the praised steps, after a leading clause and with a grounded number', () => {
    expect(isNextStep(B_AFTER[2]!, TODAY)).toBe(true);
    expect(isNextStep(C_AFTER_STEP, TODAY)).toBe(true);
    expect(isNextStep(E_AFTER[2]!, TRENDS)).toBe(true);
    expect(isNextStep('Try to keep today light by avoiding intense workouts and aiming for a bit earlier to bed tonight.', TODAY)).toBe(true); // c before
  });

  it('does not count reminders, pointers at the app, or a step with a new number', () => {
    expect(isNextStep('Keep in mind that HRV varies.', TODAY)).toBe(false);
    expect(isNextStep('Take a look at your trends.', TODAY)).toBe(false);
    expect(isNextStep('Remember that rest is part of training.', TODAY)).toBe(false);
    expect(isNextStep('Aim for 8h 30m tonight.', TODAY)).toBe(false);
    expect(isNextStep('Try 10 minutes of deep breathing before bed.', TODAY)).toBe(false); // the c-after tip the validator dropped
  });

  it('does not take a compliment or filler opener as the answer', () => {
    for (const opener of ['Great question about your recovery!', 'Thanks for asking about your recovery.', 'Good question about recovery!']) {
      expect(checkQuality([opener, ...B_AFTER], TODAY, { answersFirst: ['recovery'] })).toEqual([expect.stringContaining('opens with filler')]);
    }
  });

  it('b: the praised after-reply answers first, names every driver and gives a step; only its closing question is flagged', () => {
    expect(checkQuality(B_AFTER, TODAY, { answersFirst: ['recovery'], namesDrivers: true, nextStep: true })).toEqual([]);
    expect(checkQuality(B_AFTER, TODAY, { noStockCheckIn: true })).toEqual([expect.stringContaining('Do you feel')]);
  });

  it('b: the disliked before-reply names one driver, gives no step and ends on a stock question', () => {
    expect(checkQuality(B_BEFORE, TODAY, { answersFirst: ['recovery'], namesDrivers: true, nextStep: true, noStockCheckIn: true })).toEqual([
      'the reply does not name the driver HRV',
      'the reply offers no concrete next step in words',
      expect.stringContaining('Have you noticed'),
    ]);
  });

  it('e: the praised after-reply turns the personal alcohol pattern (a grounded 17%) into the step', () => {
    expect(checkQuality(E_AFTER, TRENDS, { answersFirst: ['HRV'], nextStep: true })).toEqual([]);
    expect(checkQuality(E_BEFORE, TRENDS, { answersFirst: ['HRV'], nextStep: true, noStockCheckIn: true })).toEqual([
      'the reply offers no concrete next step in words',
      expect.stringContaining('Have you noticed'),
    ]);
  });
});

describe('impersonal general questions route to general', () => {
  it.each([
    'How much sleep do adults need?',
    'Is 6 hours of sleep enough for most people?',
    'What does HRV measure?',
    'How many steps a day is healthy?',
    'Does caffeine affect sleep?',
    "What's a normal resting heart rate?",
  ])('%s', (q) => {
    expect(routeQuestion(q)).toBe('general');
  });

  it('the same topics asked about the user do not', () => {
    expect(routeQuestion('How much sleep did I get?')).toBe('sleep');
    expect(routeQuestion('What is my HRV today?')).toBe('today');
    expect(routeQuestion('Does caffeine affect my sleep?')).toBe('trends');
  });
});

describe('eval suite', () => {
  // One run for the whole suite: every fixture seeds and removes its own throwaway user.
  let report: Awaited<ReturnType<typeof runEval>>;
  beforeAll(async () => {
    report = await runEval(FIXTURES, NEGATIVE_FIXTURES);
  });

  it('runs every fixture, with unique ids', () => {
    expect(report.results).toHaveLength(FIXTURES.length);
    const ids = [...FIXTURES, ...NEGATIVE_FIXTURES].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fixture passes', () => {
    const failing = report.results.filter((r) => !r.passed).map((r) => ({ id: r.id, failures: r.failures }));
    expect(failing).toEqual([]);
  });

  it('covers every category of the new contract', () => {
    const count = (c: EvalFixture['category']) => FIXTURES.filter((f) => f.category === c).length;
    expect(count('numbers')).toBeGreaterThanOrEqual(8);
    expect(count('hedged')).toBeGreaterThanOrEqual(4);
    expect(count('general')).toBeGreaterThanOrEqual(6);
    expect(count('card')).toBeGreaterThanOrEqual(5);
    expect(count('memory')).toBeGreaterThanOrEqual(5);
    expect(count('quality')).toBeGreaterThanOrEqual(3);
    expect(count('safety')).toBeGreaterThanOrEqual(1);
    const ids = FIXTURES.map((f) => f.id);
    for (const id of [
      'hedged-about-7-hours-passes',
      'hedged-about-9-hours-dropped',
      'general-knowledge-range-allowed',
      'general-figure-phrased-personally-dropped',
      'card-unknown-fact-id-dropped',
      'card-ranked-variant',
      'quality-why-names-every-driver',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('has a voice fixture for every character', () => {
    const voiced = FIXTURES.filter((f) => f.category === 'voice').map((f) => f.snapshot.personaId);
    expect(voiced.sort()).toEqual(listPersonas().map((p) => p.id).sort());
  });

  it('every general-category fixture is asked impersonally and lands on the general route', () => {
    for (const f of FIXTURES.filter((x) => x.category === 'general')) {
      expect({ id: f.id, route: routeQuestion(f.question) }).toEqual({ id: f.id, route: 'general' });
    }
  });

  it('catches every must-fail fixture on its named check and no other (besides its declared alsoFails), including an invented number', () => {
    expect(report.negatives).toHaveLength(NEGATIVE_FIXTURES.length);
    expect(NEGATIVE_FIXTURES.map((f) => f.mustFailCheck).sort()).toEqual(['attribution', 'direction', 'grounded', 'quality']);
    for (const n of report.negatives) {
      const fixture = NEGATIVE_FIXTURES.find((f) => f.id === n.id)!;
      const allowed = [n.mustFailCheck, ...(fixture.alsoFails ?? [])];
      expect(n.failures.map((f) => f.check)).toContain(n.mustFailCheck);
      expect(n.failures.map((f) => f.check).every((c) => allowed.includes(c))).toBe(true);
      expect(n.caught).toBe(true);
    }
    expect(report.ok).toBe(true);
  });
});

describe('runner behaviour', () => {
  const base: EvalFixture = {
    id: 'tmp',
    category: 'numbers',
    description: 'tmp',
    snapshot: LOW_DAY,
    question: 'How am I doing today?',
    script: ['Recovery is 26 today.'],
    expect: { outcome: 'answer', route: 'today', modelCalls: 1, sentences: ['Recovery is 26 today.'], dropped: [] },
  };

  it('a passing fixture reports no failures and leaves no user rows behind', async () => {
    const before = await prisma.user.count();
    const result = await runFixture(base);
    expect(result).toMatchObject({ passed: true, failures: [] });
    expect(await prisma.user.count()).toBe(before);
  });

  it('reports each check that failed', async () => {
    const result = await runFixture({
      ...base,
      expect: {
        outcome: 'error:timeout',
        route: 'sleep',
        modelCalls: 3,
        sentences: ['Something else.'],
        textPresent: ['99'],
        textAbsent: ['26'],
        dropped: ['unknown_number'],
        card: { tiles: ['recovery.today'] },
        promptIncludes: ['not in the prompt'],
        memory: { pending: ['x'] },
        quality: { nextStep: true },
      },
    });
    expect(result.passed).toBe(false);
    expect([...new Set(result.failures.map((f) => f.check))].sort()).toEqual(
      ['card', 'dropped', 'memory', 'modelCalls', 'outcome', 'prompt', 'quality', 'route', 'sentences', 'textAbsent', 'textPresent'].sort(),
    );
  });

  it('checks the card source the app sets, whatever the model wrote', async () => {
    const result = await runFixture({
      ...base,
      script: ['Recovery is 26 today.\n```card\n{"headline":"Low day","tiles":[{"fact":"recovery.today"}],"source":"Wellness App Data"}\n```'],
      expect: { outcome: 'answer', card: { source: 'Wellness App Data' } },
    });
    expect(result.failures).toEqual([{ check: 'card', message: 'expected source "Wellness App Data", got "Today"' }]);
  });

  it('an under-scripted provider is a failing fixture, not a crash', async () => {
    const result = await runFixture({ ...base, script: [] });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.check === 'outcome')).toBe(true);
  });

  it('a must-fail fixture whose reply is actually fine is reported as missed', async () => {
    const fine: NegativeFixture = { ...base, id: 'fine', script: ['Your recovery is 26, lower than usual.'], expect: { outcome: 'answer', directionOf: 'recovery.today' }, mustFailCheck: 'direction' };
    const [result] = await runNegativeFixtures([fine]);
    expect(result!.caught).toBe(false);
  });

  it('a must-fail fixture that fails for the WRONG reason is not counted as caught', async () => {
    const wrong: NegativeFixture = { ...base, id: 'wrong', mustFailCheck: 'direction', expect: { outcome: 'safety' } };
    const [result] = await runNegativeFixtures([wrong]);
    expect(result!.caught).toBe(false);
  });

  it('with the runtime validation on, an invented number never reaches the grounded check', async () => {
    const invented = NEGATIVE_FIXTURES.find((f) => f.id === 'numbers-invented-unguarded')!;
    const guarded = await runFixture({ ...invented, expect: { outcome: 'error:validation_failed' }, script: [...invented.script, ...invented.script] });
    expect(guarded.failures).toEqual([]);
    const unguarded = await runFixture(invented, { unguarded: true });
    expect(unguarded.failures.map((f) => f.check)).toEqual(['grounded']);
  });

  it('the direction and quality classes pass the runtime validator: only the eval catches them', async () => {
    for (const id of ['direction-contradicts-usual', 'quality-answer-buried']) {
      const f = NEGATIVE_FIXTURES.find((x) => x.id === id)!;
      const runtimeOnly = await runFixture({ ...f, expect: { outcome: 'answer', dropped: [] } });
      expect(runtimeOnly.passed).toBe(true);
    }
  });

  it('a score driver borrowed by its own metric is dropped at runtime (final review I2); unguarded, the attribution check catches it', async () => {
    const borrowed = NEGATIVE_FIXTURES.find((f) => f.id === 'attribution-borrowed-number')!;
    const guarded = await runFixture({ ...borrowed, expect: { outcome: 'error:validation_failed', dropped: ['unknown_number', 'unknown_number'] }, script: [...borrowed.script, ...borrowed.script] });
    expect(guarded.failures).toEqual([]);
    const unguarded = await runFixture(borrowed, { unguarded: true });
    expect(unguarded.failures.map((f) => f.check).sort()).toEqual(['attribution', 'grounded']);
    const [negative] = await runNegativeFixtures([borrowed]);
    expect(negative!.caught).toBe(true);
  });
});
