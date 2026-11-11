import React from 'react';
import { processColor } from 'react-native';
import { render } from '@testing-library/react-native';
import { ScoreRing, computeArcSegments } from '../../src/components/ui/score-ring';
import { COLORS } from '../../src/theme';
import type { FactorDTO } from '../../src/api/scores';

function factor(overrides: Partial<FactorDTO> & Pick<FactorDTO, 'factor'>): FactorDTO {
  const labels = { HRV: 'HRV', RHR: 'Resting HR', SLEEP_DEBT: 'Sleep debt' } as const;
  return {
    label: labels[overrides.factor],
    z: 0,
    weight: 0.3,
    contribution: 0,
    points: 0,
    imputed: false,
    excluded: false,
    ...overrides,
  };
}

const THREE_MIXED = [
  factor({ factor: 'HRV', points: 8 }),
  factor({ factor: 'RHR', points: -4 }),
  factor({ factor: 'SLEEP_DEBT', points: -2 }),
];

// react-native-svg resolves colour strings to native colour objects before they
// reach the element props, so compare against the same resolution.
function strokeOf(node: { props: { stroke?: { payload?: number } } }): number | undefined {
  return node.props.stroke?.payload;
}

const FILLED = 100;
const GAP = 2;

describe('computeArcSegments (pure geometry)', () => {
  it('produces no segments for zero factors (cold start)', () => {
    expect(computeArcSegments([], FILLED, GAP)).toEqual([]);
  });

  it('produces no segments when every factor is excluded', () => {
    const excluded = [factor({ factor: 'HRV', points: 5, excluded: true }), factor({ factor: 'RHR', points: -5, excluded: true })];

    expect(computeArcSegments(excluded, FILLED, GAP)).toEqual([]);
  });

  it('produces no segments when there is nothing filled to divide', () => {
    expect(computeArcSegments(THREE_MIXED, 0, GAP)).toEqual([]);
  });

  it('sizes each segment proportionally to |points| and colours it by helped/hurt', () => {
    const segments = computeArcSegments(THREE_MIXED, FILLED, 0);

    expect(segments.map((s) => s.factor)).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
    expect(segments.map((s) => s.tone)).toEqual(['helped', 'hurt', 'hurt']);
    // |points| 8 : 4 : 2 of a total 14 across the 100-unit filled arc.
    expect(segments[0].length).toBeCloseTo((8 / 14) * FILLED);
    expect(segments[1].length).toBeCloseTo((4 / 14) * FILLED);
    expect(segments[2].length).toBeCloseTo((2 / 14) * FILLED);
  });

  it('lays segments end to end from the start of the ring', () => {
    const segments = computeArcSegments(THREE_MIXED, FILLED, 0);

    expect(segments[0].start).toBe(0);
    expect(segments[1].start).toBeCloseTo(segments[0].length);
    expect(segments[2].start).toBeCloseTo(segments[0].length + segments[1].length);
    expect(segments[2].start + segments[2].length).toBeCloseTo(FILLED);
  });

  it('leaves a gap between segments without exceeding the filled arc', () => {
    const segments = computeArcSegments(THREE_MIXED, FILLED, GAP);

    for (let i = 1; i < segments.length; i++) {
      const previousEnd = segments[i - 1].start + segments[i - 1].length;
      expect(segments[i].start - previousEnd).toBeCloseTo(GAP);
    }
    const last = segments[segments.length - 1];
    expect(last.start + last.length).toBeLessThanOrEqual(FILLED + 1e-9);
  });

  it('marks all-negative days as all hurt', () => {
    const allNegative = [
      factor({ factor: 'HRV', points: -3 }),
      factor({ factor: 'RHR', points: -3 }),
      factor({ factor: 'SLEEP_DEBT', points: -3 }),
    ];

    const segments = computeArcSegments(allNegative, FILLED, 0);

    expect(segments.every((s) => s.tone === 'hurt')).toBe(true);
    segments.forEach((s) => expect(s.length).toBeCloseTo(FILLED / 3));
  });

  it('keeps tiny factors visible next to a single dominant one, without overflowing', () => {
    const dominant = [
      factor({ factor: 'HRV', points: 50 }),
      factor({ factor: 'RHR', points: 0.1 }),
      factor({ factor: 'SLEEP_DEBT', points: -0.1 }),
    ];

    const segments = computeArcSegments(dominant, FILLED, 0);

    expect(segments).toHaveLength(3);
    expect(segments[1].length).toBeGreaterThanOrEqual(0.08 * FILLED - 1e-9);
    expect(segments[2].length).toBeGreaterThanOrEqual(0.08 * FILLED - 1e-9);
    const total = segments.reduce((sum, s) => sum + s.length, 0);
    expect(total).toBeCloseTo(FILLED);
  });

  it('gives a lone factor the whole filled arc with no gap', () => {
    const segments = computeArcSegments([factor({ factor: 'HRV', points: 4 })], FILLED, GAP);

    expect(segments).toEqual([{ factor: 'HRV', tone: 'helped', start: 0, length: FILLED }]);
  });

  it('renormalises around an excluded factor: two arcs share the whole filled arc', () => {
    const renormalised = [
      factor({ factor: 'HRV', points: 6, excluded: false }),
      factor({ factor: 'RHR', points: -2, excluded: false }),
      factor({ factor: 'SLEEP_DEBT', points: 9, excluded: true }),
    ];

    const segments = computeArcSegments(renormalised, FILLED, 0);

    expect(segments.map((s) => s.factor)).toEqual(['HRV', 'RHR']);
    expect(segments[0].length + segments[1].length).toBeCloseTo(FILLED);
    expect(segments[0].length).toBeCloseTo(0.75 * FILLED);
  });

  it('drops zero-point factors (nothing to show) and returns nothing if all are zero', () => {
    expect(computeArcSegments([factor({ factor: 'HRV', points: 0 }), factor({ factor: 'RHR', points: 0 })], FILLED, GAP)).toEqual([]);
    expect(computeArcSegments([factor({ factor: 'HRV', points: 0 }), factor({ factor: 'RHR', points: 3 })], FILLED, GAP)).toHaveLength(1);
  });
});

describe('ScoreRing', () => {
  it('defaults to the plain single-colour fill (segmented is opt-in)', () => {
    const { getByTestId, queryByTestId } = render(<ScoreRing score={72} factors={THREE_MIXED} />);

    expect(getByTestId('score-ring-plain')).toBeTruthy();
    expect(queryByTestId('score-ring-segmented')).toBeNull();
    expect(queryByTestId(/^score-ring-segment-/)).toBeNull();
  });

  it('shows the rounded score in the middle', () => {
    const { getByText } = render(<ScoreRing score={71.6} factors={THREE_MIXED} />);

    expect(getByText('72')).toBeTruthy();
  });

  it('shows a dash rather than a number when there is no score', () => {
    const { getByText } = render(<ScoreRing score={null} factors={[]} />);

    expect(getByText('—')).toBeTruthy();
  });

  it('exposes the score to accessibility', () => {
    const { getByTestId } = render(<ScoreRing score={72} factors={THREE_MIXED} />);

    expect(getByTestId('score-ring').props.accessibilityLabel).toBe('Score 72 out of 100');
  });

  describe('segmented variant', () => {
    it('renders one arc per contributing factor', () => {
      const { getByTestId, getAllByTestId } = render(<ScoreRing score={72} factors={THREE_MIXED} segmented />);

      expect(getByTestId('score-ring-segmented')).toBeTruthy();
      expect(getAllByTestId(/^score-ring-segment-/)).toHaveLength(3);
    });

    it('colours helped arcs with scoreExcellent and hurt arcs with scorePoor (light theme)', () => {
      const { getByTestId } = render(<ScoreRing score={72} factors={THREE_MIXED} segmented />);

      expect(strokeOf(getByTestId('score-ring-segment-HRV'))).toBe(processColor(COLORS.light.scoreExcellent));
      expect(strokeOf(getByTestId('score-ring-segment-RHR'))).toBe(processColor(COLORS.light.scorePoor));
    });

    it('cold start (0 factors): no arcs, just the track', () => {
      const { getByTestId, queryByTestId } = render(<ScoreRing score={null} factors={[]} segmented />);

      expect(getByTestId('score-ring-segmented')).toBeTruthy();
      expect(queryByTestId(/^score-ring-segment-/)).toBeNull();
    });

    it('all-negative day: every arc is the hurt colour', () => {
      const allNegative = [
        factor({ factor: 'HRV', points: -3 }),
        factor({ factor: 'RHR', points: -3 }),
        factor({ factor: 'SLEEP_DEBT', points: -3 }),
      ];
      const { getAllByTestId } = render(<ScoreRing score={30} factors={allNegative} segmented />);

      const arcs = getAllByTestId(/^score-ring-segment-/);
      expect(arcs).toHaveLength(3);
      arcs.forEach((arc) => expect(strokeOf(arc)).toBe(processColor(COLORS.light.scorePoor)));
    });

    it('single dominant factor: still draws all three arcs', () => {
      const dominant = [
        factor({ factor: 'HRV', points: 40 }),
        factor({ factor: 'RHR', points: -0.2 }),
        factor({ factor: 'SLEEP_DEBT', points: 0.3 }),
      ];
      const { getAllByTestId } = render(<ScoreRing score={80} factors={dominant} segmented />);

      expect(getAllByTestId(/^score-ring-segment-/)).toHaveLength(3);
    });

    it('renormalised day with one factor excluded: draws only the two active factors', () => {
      const renormalised = [
        factor({ factor: 'HRV', points: 5 }),
        factor({ factor: 'RHR', points: -2 }),
        factor({ factor: 'SLEEP_DEBT', points: 0, excluded: true }),
      ];
      const { getAllByTestId, queryByTestId } = render(<ScoreRing score={60} factors={renormalised} segmented />);

      expect(getAllByTestId(/^score-ring-segment-/)).toHaveLength(2);
      expect(queryByTestId('score-ring-segment-SLEEP_DEBT')).toBeNull();
    });
  });

  it('matches its snapshot: plain', () => {
    expect(render(<ScoreRing score={72} factors={THREE_MIXED} />).toJSON()).toMatchSnapshot();
  });

  it('matches its snapshot: segmented, mixed factors', () => {
    expect(render(<ScoreRing score={72} factors={THREE_MIXED} segmented />).toJSON()).toMatchSnapshot();
  });

  it('matches its snapshot: segmented, cold start', () => {
    expect(render(<ScoreRing score={null} factors={[]} segmented />).toJSON()).toMatchSnapshot();
  });
});
