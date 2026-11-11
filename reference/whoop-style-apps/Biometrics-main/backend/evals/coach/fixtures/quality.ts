// The owner's quality bar (ruling R19 and the prompt's "How to answer well"
// block): answers should be informative, personable and not automated. That
// means the first sentence answers the question, a "why" names every driver the
// fact sheet shows, there is one concrete next step in words, and no stock
// check-in question; and, as everywhere, no invented number. The runtime
// enforces the numbers and drops a closing stock question once another
// sentence was shown; these fixtures pin the prompt instructions and prove
// the eval's quality check, including one must-fail reply that is perfectly
// grounded but buries the answer behind filler.

import type { EvalFixture, NegativeFixture } from '../types';
import { LOW_DAY } from './common';

const base = { category: 'quality' as const, snapshot: LOW_DAY };

export const qualityFixtures: EvalFixture[] = [
  {
    ...base,
    id: 'quality-why-names-every-driver',
    description: 'A "why" answer leads with the answer, names both drivers on the sheet and ends with a step in words.',
    question: 'Why is my recovery low today?',
    script: [
      'Your recovery is 26 today, well under your usual 58. A lower HRV at 41 ms and a resting heart rate up at 58 bpm pulled it down the most. Keep today to an easy walk and protect your bedtime tonight.',
    ],
    expect: {
      outcome: 'answer',
      route: 'today',
      dropped: [],
      attribution: true,
      promptIncludes: [
        'Answer their actual question in your first sentence.',
        'name every driver the facts show',
        '[factor.hrv]',
        '[factor.rhr]',
        'in words rather than new numbers',
      ],
      quality: { answersFirst: ['recovery'], namesDrivers: true, nextStep: true, noStockCheckIn: true },
    },
  },
  {
    ...base,
    id: 'quality-sleep-answer-first',
    description: 'A sleep question is answered in the first sentence with the real numbers, then one step in words.',
    question: 'How did I sleep last night?',
    script: [
      'You slept 6h 48m last night, 25m less than your usual 7h 13m. That is a little short rather than a bad night. Aim to start winding down a bit earlier this evening.',
    ],
    expect: {
      outcome: 'answer',
      route: 'sleep',
      dropped: [],
      quality: { answersFirst: ['slept', 'sleep'], nextStep: true, noStockCheckIn: true },
    },
  },
  {
    ...base,
    id: 'quality-personable-specific-question-back',
    description: 'A specific question back is fine when it would change the advice; a stock check-in is not.',
    question: 'How am I doing today?',
    script: [
      'Today is a lighter day: recovery is 26, well under your usual 58. Your HRV and resting heart rate are both off their usual, which is what pulled it down. Plan something easy and save the hard session for when it bounces back. Is your long run still on for this weekend?',
    ],
    expect: {
      outcome: 'answer',
      dropped: [],
      directionOf: 'recovery.today',
      promptIncludes: ['A question back is optional', 'Never a generic check-in'],
      quality: { answersFirst: ['recovery'], namesDrivers: true, nextStep: true, noStockCheckIn: true },
    },
  },
  {
    ...base,
    id: 'quality-closing-offer-dropped',
    description:
      'The C8 shape: a short, grounded answer that ends on an offer of choices. The runtime drops the offer, so the reply ends on its suggestion; the prompt asks for that and for two or three numbers only (final review I4, R48).',
    question: 'Should I train hard today?',
    script: [
      'Not today: recovery is 26, well under your usual 58, mostly because your HRV and resting heart rate are off. Keep it to an easy walk and save the hard session for when it bounces back. Would you prefer to focus on light movement or complete rest?',
    ],
    expect: {
      outcome: 'answer',
      route: 'today',
      dropped: ['stock_question'],
      sentences: [
        'Not today: recovery is 26, well under your usual 58, mostly because your HRV and resting heart rate are off.',
        'Keep it to an easy walk and save the hard session for when it bounces back.',
      ],
      promptIncludes: ["End on your suggestion; never offer choices or ask what they'd prefer", 'Use at most two or three of their numbers'],
      quality: { answersFirst: ['today', 'recovery'], namesDrivers: true, nextStep: true, noStockCheckIn: true },
    },
  },
];

export const qualityNegativeFixtures: NegativeFixture[] = [
  {
    ...base,
    id: 'quality-answer-buried',
    description: 'Every sentence is grounded, but the answer hides behind filler and there is no step: only the quality check catches it.',
    question: 'Why is my recovery low today?',
    script: ['Great question! Let us take a look at your data together. Your recovery is 26 today.'],
    expect: { outcome: 'answer', dropped: [], quality: { answersFirst: ['recovery'], nextStep: true } },
    mustFailCheck: 'quality',
  },
];
