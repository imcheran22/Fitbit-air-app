// General questions (spec 2026-09-30, sections 2.1-2.4): a health or fitness
// question with no personal reference is answered like a knowledgeable friend.
// Its fact sheet is one profile line (sleep goal, typical sleep) and no
// metrics; typical ranges ("7-9 hours") are allowed as general knowledge, but a
// number stated ABOUT the user is still checked against the sheet. Every
// question here is asked impersonally and must land on the general route; a
// general figure is said about people in general ("most adults need..."), so a
// figure phrased about the user ("you need 7-9 hours") is dropped.

import type { EvalFixture } from '../types';
import { LOW_DAY } from './common';

const base = { category: 'general' as const, snapshot: LOW_DAY };

export const generalFixtures: EvalFixture[] = [
  {
    ...base,
    id: 'general-knowledge-range-allowed',
    description: 'A typical range is general knowledge on the general route; the answer is talk only.',
    question: 'How much sleep do adults need?',
    script: ['Most adults need 7–9 hours a night. Consistency matters as much as the total. Try keeping the same bedtime on weekends too.'],
    expect: {
      outcome: 'answer',
      route: 'general',
      modelCalls: 1,
      dropped: [],
      card: null,
      sentences: ['Most adults need 7–9 hours a night.', 'Consistency matters as much as the total.', 'Try keeping the same bedtime on weekends too.'],
      promptIncludes: [
        'general health and fitness knowledge',
        'State general figures about people in general',
        '[sleep.goal] Sleep goal: 8h 0m',
        '[sleep.usual] Typical sleep (30-day average): 7h 13m',
      ],
      promptExcludes: ['[recovery.today]', '[hrv.today]'],
      quality: { answersFirst: ['adults', '7–9 hours'], nextStep: true, noStockCheckIn: true },
    },
  },
  {
    ...base,
    id: 'general-figure-phrased-personally-dropped',
    description: 'A general figure said about the user ("You need 7–9 hours") reads as a claim about them and is dropped.',
    question: 'How much sleep do adults need?',
    script: ['Most adults need 7–9 hours a night. You need 7–9 hours to feel your best. A steady bedtime matters as much as the total.'],
    expect: {
      outcome: 'answer',
      route: 'general',
      dropped: ['unknown_number'],
      sentences: ['Most adults need 7–9 hours a night.', 'A steady bedtime matters as much as the total.'],
    },
  },
  {
    ...base,
    id: 'general-impersonal-short-night',
    description: 'An impersonal "is 6 hours enough" question is general: the figures are about people, not this user.',
    question: 'Is 6 hours of sleep enough for most people?',
    script: ['For most adults, 6 hours is on the short side of the 7–9 hours usually recommended. Try a steady bedtime first: it is the easiest way to get more.'],
    expect: { outcome: 'answer', route: 'general', dropped: [], card: null, quality: { answersFirst: ['6 hours', 'short'], nextStep: true } },
  },
  {
    ...base,
    id: 'general-impersonal-what-is-hrv',
    description: 'Explaining a metric is general knowledge, answered without the user\'s readings.',
    question: 'What does HRV measure?',
    script: ['HRV measures the variation in time between heartbeats, and a higher reading usually means the body is well recovered. It is most useful compared against your own usual rather than other people.'],
    expect: { outcome: 'answer', route: 'general', dropped: [], card: null, promptExcludes: ['[hrv.today]'], quality: { answersFirst: ['heartbeats'] } },
  },
  {
    ...base,
    id: 'general-impersonal-steps',
    description: 'A step-count range for people in general is allowed on the general route.',
    question: 'How many steps a day is healthy?',
    script: ['For most adults, around 7,000 to 10,000 steps a day is linked with good health. Start with a short walk after meals; any extra walking counts.'],
    expect: { outcome: 'answer', route: 'general', dropped: [], textPresent: ['7,000 to 10,000 steps'], quality: { answersFirst: ['steps'], nextStep: true } },
  },
  {
    ...base,
    id: 'general-plain-number-range',
    description: 'Plain-number ranges ("60 to 100 bpm") are general knowledge too.',
    question: "What's a normal resting heart rate?",
    script: ['For most adults a resting heart rate between 60 and 100 bpm is considered normal. Fitter people often sit lower.'],
    expect: { outcome: 'answer', route: 'general', dropped: [], card: null },
  },
  {
    ...base,
    id: 'general-claim-about-the-user-still-checked',
    description: 'On the general route a number about the user ("you slept 5 hours") is still checked, and dropped.',
    question: 'How much sleep do adults need?',
    script: ['Most adults need 7–9 hours a night. You slept 5 hours last night, which is short.'],
    expect: { outcome: 'answer', route: 'general', dropped: ['unknown_number'], sentences: ['Most adults need 7–9 hours a night.'] },
  },
  {
    ...base,
    id: 'general-grounded-personal-tie-in',
    description: "Tying the answer back to the user's own profile line is fine when the numbers match the sheet.",
    question: 'How much sleep do adults need?',
    script: ['Most adults need 7–9 hours. Your goal is 8h 0m and you usually get 7h 13m, so you are close.'],
    expect: { outcome: 'answer', route: 'general', dropped: [], textPresent: ['7h 13m'] },
  },
  {
    ...base,
    id: 'general-disallowed-topic-still-dropped',
    description: 'The general allowance never covers supplement advice.',
    question: 'What helps with falling asleep?',
    script: ['A dark, cool room helps. Magnesium supplements are worth a try. So does a steady bedtime.'],
    expect: {
      outcome: 'answer',
      route: 'general',
      dropped: ['disallowed_topic'],
      sentences: ['A dark, cool room helps.', 'So does a steady bedtime.'],
    },
  },
];
