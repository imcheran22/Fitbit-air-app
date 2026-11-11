// Answer cards (spec 2026-09-30, sections 2.3-2.4): the model names fact ids,
// the server fills every value from the fact sheet. Unknown ids are dropped, a
// card with no valid rows is dropped (the talk still shows), a label with
// digits falls back to the fact's own label, and a tip must pass the same
// sentence validation as the reply. The source line is set by the app from the
// route; whatever the model writes there is ignored. The runner always checks
// that every card value, usual, status and difference equals the fact sheet's.

import type { EvalFixture } from '../types';
import { cardBlock, LOW_DAY } from './common';

const base = { category: 'card' as const, snapshot: LOW_DAY, question: 'How am I doing today?' };
const TALK = 'Recovery is 26 today, well under your usual 58. Take it easy.';

export const cardFixtures: EvalFixture[] = [
  {
    ...base,
    id: 'card-tiles-filled-from-facts',
    description: 'Tiles reference fact ids; the server fills the values, and the tip survives validation.',
    script: [
      TALK +
        cardBlock({
          headline: 'Recovery is low today',
          tiles: [
            { fact: 'recovery.today', label: 'Recovery' },
            { fact: 'hrv.today', label: 'HRV' },
            { fact: 'sleep.total', label: 'Sleep' },
          ],
          tip: 'Keep today to an easy walk.',
          source: "Today's scores",
        }),
    ],
    expect: {
      outcome: 'answer',
      dropped: [],
      card: {
        tiles: ['recovery.today', 'hrv.today', 'sleep.total'],
        labels: ['Recovery', 'HRV', 'Sleep'],
        // Literal app output: 26 vs 58 and 41 vs 52 are below; 6h 48m vs 7h 13m is within 10%, so near.
        statuses: ['below', 'below', 'near'],
        deltas: ['−32 points', '−11 ms', '−25m'],
        tip: true,
        source: 'Today',
      },
    },
  },
  {
    ...base,
    id: 'card-unknown-fact-id-dropped',
    description: 'A tile with an unknown fact id is dropped; the known ones stay.',
    script: [TALK + cardBlock({ headline: 'Low day', tiles: [{ fact: 'recovery.today', label: 'Recovery' }, { fact: 'wakeups.lastnight', label: 'Wake-ups' }], source: 'Today' })],
    expect: { outcome: 'answer', card: { tiles: ['recovery.today'] } },
  },
  {
    ...base,
    id: 'card-no-known-fact-dropped',
    description: 'A card whose rows are all unknown is dropped, and the talk is still shown.',
    script: [TALK + cardBlock({ headline: 'Low day', tiles: [{ fact: 'made.up', label: 'Nope' }], source: 'Today' })],
    expect: { outcome: 'answer', card: null, sentences: ['Recovery is 26 today, well under your usual 58.', 'Take it easy.'] },
  },
  {
    ...base,
    id: 'card-model-values-ignored',
    description: 'A value the model puts in a tile is ignored: the displayed value is always the fact sheet\'s.',
    script: [TALK + cardBlock({ headline: 'Low day', tiles: [{ fact: 'recovery.today', label: 'Recovery', value: 99, display: '99' }], source: 'Today' })],
    expect: { outcome: 'answer', card: { tiles: ['recovery.today'] } },
  },
  {
    ...base,
    id: 'card-digit-label-replaced',
    description: 'A label carrying digits could smuggle a number: it is replaced by the fact label.',
    script: [TALK + cardBlock({ headline: 'Low day', tiles: [{ fact: 'recovery.today', label: 'Recovery 99' }], source: 'Today' })],
    expect: { outcome: 'answer', card: { tiles: ['recovery.today'], labels: ['Recovery today'] } },
  },
  {
    ...base,
    id: 'card-invented-tip-dropped',
    description: 'A tip with an invented number is dropped; the card stays.',
    script: [TALK + cardBlock({ headline: 'Low day', tiles: [{ fact: 'recovery.today', label: 'Recovery' }], tip: 'Sleep 9 hours tonight.', source: 'Today' })],
    expect: { outcome: 'answer', card: { tiles: ['recovery.today'], tip: false } },
  },
  {
    ...base,
    id: 'card-ranked-variant',
    description: 'A ranked list (2-5 rows) instead of tiles, on the trends route.',
    question: 'How have my numbers trended this month?',
    script: [
      'Over the month your resting heart rate held at 55 bpm and HRV at 52 ms.' +
        cardBlock({
          headline: 'Your month at a glance',
          ranked: [
            { fact: 'rhr.avg30', label: 'Resting HR' },
            { fact: 'hrv.avg30', label: 'HRV' },
            { fact: 'sleep.avg30', label: 'Sleep' },
          ],
          source: 'Trends · last 30 days',
        }),
    ],
    expect: { outcome: 'answer', route: 'trends', dropped: [], card: { ranked: ['rhr.avg30', 'hrv.avg30', 'sleep.avg30'], source: 'Your last 30 days' } },
  },
];
