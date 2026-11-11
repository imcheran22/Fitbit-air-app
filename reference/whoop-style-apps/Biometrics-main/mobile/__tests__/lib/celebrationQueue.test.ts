import { celebrationQueue } from '../../src/lib/celebrationQueue';

it('celebrates each family once, at its highest new level, highest levels first', () => {
  expect(celebrationQueue([
    { id: 'c1', family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07' },
    { id: 's1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' },
    { id: 's2', family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07' },
    { id: 'm1', family: 'EVERY_DAY_LOGGED', level: 1, value: 1, earnedOn: '2026-09-30' },
  ])).toEqual([
    { family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07', ids: ['s1', 's2'] },
    { family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07', ids: ['c1'] },
    { family: 'EVERY_DAY_LOGGED', level: 1, value: 1, earnedOn: '2026-09-30', ids: ['m1'] },
  ]);
  expect(celebrationQueue([])).toEqual([]);
});
