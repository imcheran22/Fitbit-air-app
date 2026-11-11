// Hedged approximations (spec 2026-09-30, section 2.4 as built): a number
// introduced by "about", "around", "roughly", "nearly", "almost", "close to",
// "~", "just under" or "just over" may be within ±10% of a fact of the same
// kind (durations vs plain numbers). Unhedged, the normal tolerance applies.
// LOW_DAY: sleep 6h 48m (408 minutes), steps 2,950, recovery usual 58.

import type { EvalFixture } from '../types';
import { LOW_DAY } from './common';

const base = { category: 'hedged' as const, snapshot: LOW_DAY, question: 'How did I sleep last night?' };

export const hedgedFixtures: EvalFixture[] = [
  {
    ...base,
    id: 'hedged-about-7-hours-passes',
    description: '"about 7 hours" for 6h 48m is within 10%.',
    script: ['You got about 7 hours last night.'],
    expect: { outcome: 'answer', route: 'sleep', dropped: [], sentences: ['You got about 7 hours last night.'] },
  },
  {
    ...base,
    id: 'hedged-nearly-and-just-under',
    description: '"nearly 7 hours" and "just under 7 hours" are hedges too.',
    script: ['That was nearly 7 hours. Just under 7 hours, to be exact-ish.'],
    expect: { outcome: 'answer', dropped: [], sentences: ['That was nearly 7 hours.', 'Just under 7 hours, to be exact-ish.'] },
  },
  {
    ...base,
    id: 'hedged-about-9-hours-dropped',
    description: '"about 9 hours" is more than 10% away from 6h 48m: dropped.',
    script: ['You got about 9 hours last night. Nice and steady.'],
    expect: { outcome: 'answer', dropped: ['unknown_number'], sentences: ['Nice and steady.'] },
  },
  {
    ...base,
    id: 'hedged-unhedged-7-hours-dropped',
    description: 'Without a hedge, "7 hours" must be within the normal tolerance of 6h 48m: dropped.',
    script: ['You slept 7 hours last night. Nice and steady.'],
    expect: { outcome: 'answer', dropped: ['unknown_number'], sentences: ['Nice and steady.'] },
  },
  {
    ...base,
    id: 'hedged-plain-numbers',
    description: '"~3,000 steps" for 2,950 and "around 60" for a usual 58 pass; "roughly 90" is near nothing on the sheet.',
    question: 'How am I doing today?',
    script: ['You are at ~3,000 steps so far. Recovery usually sits around 60 for you. Your HRV is roughly 90 ms.'],
    expect: {
      outcome: 'answer',
      route: 'today',
      dropped: ['unknown_number'],
      sentences: ['You are at ~3,000 steps so far.', 'Recovery usually sits around 60 for you.'],
    },
  },
  {
    ...base,
    id: 'hedged-duration-does-not-match-a-plain-number',
    description: 'A hedge never crosses kinds: "about 60 minutes" is not the plain number 58.',
    question: 'How am I doing today?',
    script: ['Take about 60 minutes to wind down tonight. Recovery is 26.'],
    expect: { outcome: 'answer', dropped: ['unknown_number'], sentences: ['Recovery is 26.'] },
  },
];
