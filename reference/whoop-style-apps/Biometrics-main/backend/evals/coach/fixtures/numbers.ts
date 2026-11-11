// Number validation (spec 2026-09-30, section 2.4): every number about the user
// must be on the fact sheet, within tolerance and across unit spellings. A
// sentence with an invented number is dropped and the rest keeps streaming;
// when nothing survives, one regeneration; then an error card.

import type { EvalFixture } from '../types';
import { LOW_DAY } from './common';

const base = { category: 'numbers' as const, snapshot: LOW_DAY, question: 'How am I doing today?' };

export const numberFixtures: EvalFixture[] = [
  {
    ...base,
    id: 'numbers-grounded-today',
    description: "Numbers straight from the fact sheet, each pinned on its own metric, pass untouched.",
    script: ['Your recovery is 26 today, well under your usual 58. HRV is 41 ms against a usual 52 ms. Take it easy this morning.'],
    expect: {
      outcome: 'answer',
      route: 'today',
      modelCalls: 1,
      dropped: [],
      sentences: [
        'Your recovery is 26 today, well under your usual 58.',
        'HRV is 41 ms against a usual 52 ms.',
        'Take it easy this morning.',
      ],
      attribution: true,
      promptIncludes: ['[recovery.today] Recovery today: 26 (usual 58, 32 lower than usual)', '[hrv.today] HRV today: 41 ms'],
    },
  },
  {
    ...base,
    id: 'numbers-invented-sentence-dropped',
    description: 'A sentence with an invented number is dropped; the sentences around it are still shown.',
    script: [['Recovery is 26 today. ', 'Your HRV is 95 ms. ', 'Keep it light.']],
    expect: {
      outcome: 'answer',
      modelCalls: 1,
      dropped: ['unknown_number'],
      sentences: ['Recovery is 26 today.', 'Keep it light.'],
      textAbsent: ['95'],
    },
  },
  {
    ...base,
    id: 'numbers-invented-everything-then-good',
    description: 'When no sentence survives, the model is asked once more and the second answer is shown.',
    script: ['Your HRV is 95 ms and recovery 71.', 'Recovery is 26 today. Take it easy.'],
    expect: {
      outcome: 'answer',
      modelCalls: 2,
      dropped: ['unknown_number'],
      sentences: ['Recovery is 26 today.', 'Take it easy.'],
    },
  },
  {
    ...base,
    id: 'numbers-invented-twice-error',
    description: 'Two answers with nothing valid end in the validation_failed error, never a made-up reply.',
    script: ['Your HRV is 95 ms.', 'Your HRV is 96 ms.'],
    expect: { outcome: 'error:validation_failed', modelCalls: 2, dropped: ['unknown_number', 'unknown_number'], sentences: [] },
  },
  {
    ...base,
    id: 'numbers-unit-equivalence',
    description: '"6h 48m" = "408 minutes" = "6.8 hours" = "6 hours and 48 minutes".',
    question: 'How did I sleep last night?',
    script: ['You slept 6h 48m, which is 408 minutes. That is about 6.8 hours. Put another way, 6 hours and 48 minutes.'],
    expect: { outcome: 'answer', route: 'sleep', dropped: [], textPresent: ['408 minutes', '6.8 hours', '6 hours and 48 minutes'] },
  },
  {
    ...base,
    id: 'numbers-hyphenated-duration',
    description:
      'A hyphenated duration ("9-hour goal") is a duration, never a bare 9 borrowing the sleep score\'s 10-point difference; the real 8-hour goal passes (final review C1).',
    question: 'How did I sleep last night?',
    script: ['You slept 6h 48m last night. Aim to reach your 9-hour goal again. Aim to reach your 8-hour goal tonight.'],
    expect: {
      outcome: 'answer',
      route: 'sleep',
      dropped: ['unknown_number'],
      sentences: ['You slept 6h 48m last night.', 'Aim to reach your 8-hour goal tonight.'],
      textAbsent: ['9-hour'],
      promptIncludes: ['[sleep.goal] Sleep goal: 8h 0m'],
    },
  },
  {
    ...base,
    id: 'numbers-steps-so-far-no-usual',
    description:
      'Steps so far are a partial day: the sheet states no full-day usual, so "2,950 against your usual 8,000" is dropped while the count itself is fine (final review I3).',
    script: ['Recovery is 26 today. You have 2,950 steps so far. You only managed 2,950 steps against your usual 8,000. Keep it light.'],
    expect: {
      outcome: 'answer',
      dropped: ['unknown_number'],
      sentences: ['Recovery is 26 today.', 'You have 2,950 steps so far.', 'Keep it light.'],
      promptIncludes: ['[steps.today] Steps today so far: 2,950 (a partial day: the day is not over)', 'Steps so far today are a partial day'],
      promptExcludes: ['usual 8,000'],
    },
  },
  {
    ...base,
    id: 'numbers-rounding-tolerance',
    description: 'Off by one on an integer (27 for 26) and one minute on a duration (6h 49m) pass; 28 does not.',
    script: ['Recovery is 27 this morning. Last night was 6h 49m of sleep. Recovery was 28 an hour ago.'],
    expect: {
      outcome: 'answer',
      dropped: ['unknown_number'],
      sentences: ['Recovery is 27 this morning.', 'Last night was 6h 49m of sleep.'],
    },
  },
  {
    ...base,
    id: 'numbers-times-dates-lists-exempt',
    description: 'Times of day, month-name dates, ordinals and list markers are not numbers about the user.',
    script: ['Try to be in bed by 10pm tonight. Aim to wind down after 21:30 on September 30. It is the 30th, a good day to reset.'],
    expect: { outcome: 'answer', dropped: [], textPresent: ['10pm', '21:30', 'September 30', 'the 30th'] },
  },
  {
    ...base,
    id: 'numbers-milliseconds-not-minutes',
    description: '"41 ms" is HRV, not 41 minutes of sleep: it is checked as a plain number.',
    script: ['HRV sits at 41 ms.'],
    expect: { outcome: 'answer', dropped: [], sentences: ['HRV sits at 41 ms.'] },
  },
  {
    ...base,
    id: 'numbers-disallowed-topic-dropped',
    description: 'Medication dosing and supplement advice are dropped like an invented number.',
    script: ['Recovery is 26 today. Take 3 mg of melatonin tonight. An early night will help.'],
    expect: {
      outcome: 'answer',
      dropped: ['disallowed_topic'],
      sentences: ['Recovery is 26 today.', 'An early night will help.'],
      textAbsent: ['melatonin'],
    },
  },
  {
    ...base,
    id: 'numbers-missing-data-stated',
    description: 'With no data synced, the sheet says so and the model is told not to invent anything.',
    snapshot: {},
    script: ["I don't have your readings for today yet. Once your first night syncs, I can dig in."],
    expect: {
      outcome: 'answer',
      dropped: [],
      promptIncludes: ['No health data has synced yet', 'No Recovery score for today yet', 'No sleep recorded last night'],
      promptExcludes: ['[recovery.today]'],
    },
  },
];
