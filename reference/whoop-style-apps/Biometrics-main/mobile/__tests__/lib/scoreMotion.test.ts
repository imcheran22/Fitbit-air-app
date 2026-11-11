import { staggerOrder, staggerDelays, pointsByFactor } from '../../src/lib/scoreMotion';
import { MOTION } from '../../src/theme';

describe('staggerOrder', () => {
  it('orders factors by |delta points| descending -- the factor that moved most goes first', () => {
    const prev = { HRV: 5, RHR: -3, SLEEP_DEBT: -1 };
    const next = [
      { factor: 'HRV', points: 5.2 }, // delta 0.2
      { factor: 'RHR', points: -8 }, // delta 5
      { factor: 'SLEEP_DEBT', points: 0 }, // delta 1
    ];

    expect(staggerOrder(prev, next)).toEqual(['RHR', 'SLEEP_DEBT', 'HRV']);
  });

  it('treats a missing previous state as all zeros, so first paint orders by |points|', () => {
    const next = [
      { factor: 'HRV', points: 2 },
      { factor: 'RHR', points: -6 },
      { factor: 'SLEEP_DEBT', points: 4 },
    ];

    expect(staggerOrder(undefined, next)).toEqual(['RHR', 'SLEEP_DEBT', 'HRV']);
  });

  it('treats a factor absent from the previous state as starting at zero', () => {
    const next = [
      { factor: 'HRV', points: 1 },
      { factor: 'RHR', points: 3 },
    ];

    expect(staggerOrder({ HRV: 1 }, next)).toEqual(['RHR', 'HRV']);
  });

  it('is stable on ties, keeping the incoming factor order', () => {
    const next = [
      { factor: 'HRV', points: 2 },
      { factor: 'RHR', points: -2 },
      { factor: 'SLEEP_DEBT', points: 2 },
    ];

    expect(staggerOrder(undefined, next)).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
  });

  it('returns an empty order for no factors (cold start)', () => {
    expect(staggerOrder(undefined, [])).toEqual([]);
  });
});

describe('staggerDelays', () => {
  const next = [
    { factor: 'HRV', points: 1 },
    { factor: 'RHR', points: -9 },
    { factor: 'SLEEP_DEBT', points: 4 },
  ];

  it('gives the biggest mover zero delay and steps each later factor by the fast duration token', () => {
    expect(staggerDelays(undefined, next)).toEqual({
      RHR: 0,
      SLEEP_DEBT: MOTION.duration.fast,
      HRV: MOTION.duration.fast * 2,
    });
  });

  it('accepts an explicit step', () => {
    expect(staggerDelays(undefined, next, 100)).toEqual({ RHR: 0, SLEEP_DEBT: 100, HRV: 200 });
  });
});

describe('pointsByFactor', () => {
  it('maps each factor id to its points', () => {
    expect(pointsByFactor([{ factor: 'HRV', points: 1.5 }, { factor: 'RHR', points: -2 }])).toEqual({ HRV: 1.5, RHR: -2 });
  });
});
