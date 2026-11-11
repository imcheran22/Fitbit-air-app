import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { MOCKUP_CLOCK, MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { StageLanes, laneEntering, stageLanesLabel } from '../../src/components/sleep/StageLanes';

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  // `default` (Animated) is not an own enumerable key, so a spread alone drops it.
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduceMotion };
});

beforeEach(() => {
  mockReduceMotion = false;
});

// The chart area measures itself; jest has no layout pass, so the test sends one.
function renderLanes(stages = MOCKUP_SEGMENTS) {
  render(<StageLanes stages={stages} clock={MOCKUP_CLOCK} />);
  fireEvent(screen.getByTestId('stage-lanes-area'), 'layout', { nativeEvent: { layout: { width: 250, height: 176 } } });
}

describe('StageLanes', () => {
  it('names each lane with its total, awake at the top and deep at the bottom', () => {
    renderLanes();

    expect(screen.getByTestId('stage-lane-AWAKE')).toHaveTextContent(/Awake\s*18m/);
    expect(screen.getByTestId('stage-lane-REM')).toHaveTextContent(/REM\s*2h 03m/);
    expect(screen.getByTestId('stage-lane-LIGHT')).toHaveTextContent(/Light\s*3h 51m/);
    expect(screen.getByTestId('stage-lane-DEEP')).toHaveTextContent(/Deep\s*1h 30m/);
  });

  it('draws a block per stretch, the brief wake as a marker, and a pill per cycle', () => {
    renderLanes();

    expect(screen.getAllByTestId('stage-block')).toHaveLength(19);
    expect(screen.getAllByTestId('stage-wake-marker')).toHaveLength(1);
    const pills = screen.getAllByTestId('stage-cycle-pill');
    expect(pills).toHaveLength(5);
    expect(pills[0]).toHaveTextContent('1');
    expect(screen.getByText('Cycles')).toBeTruthy();
  });

  it('labels the time axis at the start, middle and end of the night in local time', () => {
    renderLanes();

    const axis = screen.getByTestId('stage-lanes-axis');
    expect(within(axis).getByText('11:10 pm')).toBeTruthy();
    expect(within(axis).getByText('3:01 am')).toBeTruthy();
    expect(within(axis).getByText('6:52 am')).toBeTruthy();
  });

  it('is one image to a screen reader, speaking minutes per stage and the wake-ups', () => {
    renderLanes();

    const chart = screen.getByLabelText(/^Sleep stages:/);
    expect(chart.props.accessibilityRole).toBe('image');
    expect(chart.props.accessibilityLabel).toBe('Sleep stages: 18 min awake, 123 min REM, 231 min light, 90 min deep; woke 1 time in the night');
  });

  it('renders its final state with reduced motion on', () => {
    mockReduceMotion = true;
    renderLanes();

    expect(screen.getAllByTestId('stage-block')).toHaveLength(19);
    expect(screen.getAllByTestId('stage-cycle-pill')).toHaveLength(5);
  });

  it('shows no pills on a night without REM', () => {
    renderLanes([seg('LIGHT', 0, 60), seg('DEEP', 60, 120)]);

    expect(screen.getAllByTestId('stage-block')).toHaveLength(2);
    expect(screen.queryByTestId('stage-cycle-pill')).toBeNull();
  });
});

describe('StageLanes edge cases', () => {
  it('ends the axis at the latest end when an earlier segment outlasts the last one', () => {
    renderLanes([seg('LIGHT', 0, 120), seg('REM', 50, 60)]);

    // 23:10 + 120 min, not 23:10 + 60 min.
    expect(within(screen.getByTestId('stage-lanes-axis')).getByText('1:10 am')).toBeTruthy();
  });

  it('neither marks nor counts a wake that rounds to 0 min', () => {
    renderLanes([seg('LIGHT', 0, 60), seg('AWAKE', 60, 60.4), seg('REM', 60.4, 120)]);

    expect(screen.queryByTestId('stage-wake-marker')).toBeNull();
    expect(screen.getByLabelText(/no wake-ups in the night$/)).toBeTruthy();
  });
});

describe('stageLanesLabel', () => {
  it('says how many times the night was interrupted, or that it was not', () => {
    const minutes = { AWAKE: 5, REM: 60, LIGHT: 200, DEEP: 80 };
    expect(stageLanesLabel(minutes, 0)).toBe('Sleep stages: 5 min awake, 60 min REM, 200 min light, 80 min deep; no wake-ups in the night');
    expect(stageLanesLabel(minutes, 3)).toBe('Sleep stages: 5 min awake, 60 min REM, 200 min light, 80 min deep; woke 3 times in the night');
  });
});

describe('laneEntering', () => {
  it('has no entrance with reduced motion, and one otherwise', () => {
    expect(laneEntering(0.5, true)).toBeUndefined();
    expect(laneEntering(0.5, false)).toBeDefined();
  });
});
