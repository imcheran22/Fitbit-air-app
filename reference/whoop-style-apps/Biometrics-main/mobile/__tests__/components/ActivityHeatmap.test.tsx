import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import { ActivityHeatmap, type RecoveryCalendarState, type SleepState } from '../../src/components/activity-heatmap';
import type { SleepNight } from '../../src/api/sleep';
import { COLORS, FONTS } from '../../src/theme';

const TODAY = '2026-09-22';
const BANDS = { excellent: 80, good: 60, fair: 40 };

const NO_SLEEP: SleepState = { phase: 'ready', nights: new Map(), earliestDate: '2025-01-01' };
const NO_RECOVERY: RecoveryCalendarState = { phase: 'ready', scores: new Map(), bands: BANDS, from: '2026-05-26' };

function nightOf(date: string, minutesAsleep: number, extra: Partial<SleepNight> = {}): [string, SleepNight] {
  return [date, { date, minutesAsleep, minutesInBed: null, bedtime: null, wakeTime: null, sleepScore: null, minutesAwake: null, stageMinutes: null, hasStages: false, ...extra }];
}

const sleepOf = (nights: [string, SleepNight][], earliestDate: string | null = '2025-01-01'): SleepState => ({ phase: 'ready', nights: new Map(nights), earliestDate });
const recoveryOf = (scores: [string, number][]): RecoveryCalendarState => ({ ...NO_RECOVERY, scores: new Map(scores) });

function renderHeatmap(
  steps: [string, number][],
  opts: Partial<React.ComponentProps<typeof ActivityHeatmap>> = {},
) {
  const utils = render(
    <ActivityHeatmap steps={new Map(steps)} earliestDate="2025-01-01" today={TODAY} sleep={NO_SLEEP} recovery={NO_RECOVERY} {...opts} />,
  );
  measure(utils);
  return utils;
}

// The grid is sized from the measured width; 350 gives 50 dp month bins.
function measure(utils: ReturnType<typeof render>) {
  const canvas = utils.queryByTestId('heatmap-canvas');
  if (canvas) fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 350, height: 300 } } });
}

describe('ActivityHeatmap: the calendar', () => {
  it("opens on Steps and the current month's calendar", () => {
    const { getByTestId } = renderHeatmap([]);

    expect(getByTestId('activity-tab-steps').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId('heatmap-title')).toHaveTextContent('September 2026');
    expect(getByTestId('heatmap-grid')).toBeTruthy();
  });

  it('pages back through months but not into the future, nor past the month a year ago', () => {
    const { getByTestId } = renderHeatmap([]);

    expect(getByTestId('heatmap-next-month')).toBeDisabled();
    fireEvent.press(getByTestId('heatmap-prev-month'));
    expect(getByTestId('heatmap-title')).toHaveTextContent('August 2026');
    fireEvent.press(getByTestId('heatmap-next-month'));
    expect(getByTestId('heatmap-title')).toHaveTextContent('September 2026');

    for (let i = 0; i < 20; i++) fireEvent.press(getByTestId('heatmap-prev-month'));
    expect(getByTestId('heatmap-title')).toHaveTextContent('September 2025');
    expect(getByTestId('heatmap-prev-month')).toBeDisabled();
  });

  it('switches to the year and year-to-date views', () => {
    const { getByTestId, queryByTestId } = renderHeatmap([]);

    fireEvent.press(getByTestId('heatmap-view-year'));
    expect(getByTestId('heatmap-title')).toHaveTextContent('Last 12 months');
    expect(queryByTestId('heatmap-prev-month')).toBeNull();

    fireEvent.press(getByTestId('heatmap-view-ytd'));
    expect(getByTestId('heatmap-title')).toHaveTextContent('2026 year to date');
  });

  it('draws a cell per day through today, outlines today, and dims days with no data', () => {
    const utils = renderHeatmap([['2026-09-21', 8000]]);
    const squares = within(utils.getByTestId('heatmap-canvas')).UNSAFE_getAllByType(Rect);
    expect(squares).toHaveLength(22);
    const today = squares[21]!;
    const empty = squares[0]!;
    expect([COLORS.light.foreground, COLORS.dark.foreground]).toContain(today.props.stroke);
    expect(today.props.strokeWidth).toBe(2);
    expect([COLORS.light.hairline, COLORS.dark.hairline]).toContain(empty.props.stroke);
    expect([COLORS.light.heatEmpty, COLORS.dark.heatEmpty]).toContain(empty.props.fill);
  });

  it('puts a weather icon in a day that has a recovery score, and reads it out', () => {
    const { getByTestId, queryByTestId } = renderHeatmap([['2026-09-04', 14102]], { recovery: recoveryOf([['2026-09-04', 81]]) });

    // The icon is hidden from screen readers: the cell's label says the weather.
    expect(getByTestId('activity-cal-weather-2026-09-04', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByTestId('activity-cal-weather-2026-09-05', { includeHiddenElements: true })).toBeNull();
    expect(getByTestId('activity-cal-2026-09-04').props.accessibilityLabel).toBe('Sep 4: 14,102 steps, recovery 81 clear skies');
    expect(getByTestId('activity-cal-2026-09-05').props.accessibilityLabel).toBe('Sep 5: no data');
  });

  it('shows the Less → More legend and the Recovery weather legend', () => {
    const { getByTestId } = renderHeatmap([]);
    expect(getByTestId('heatmap-legend')).toHaveTextContent(/Less/);
    expect(getByTestId('heatmap-legend')).toHaveTextContent(/More/);
    expect(getByTestId('heatmap-legend-recovery')).toHaveTextContent(/Recovery/);
  });

  it('describes the year grid as one accessible element', () => {
    const { getByTestId } = renderHeatmap([]);
    fireEvent.press(getByTestId('heatmap-view-year'));
    expect(getByTestId('heatmap-grid').props.accessibilityLabel).toBe('Steps for the last 12 months');
  });

  it('is honest about history that has not synced yet', () => {
    const syncing = renderHeatmap([], { earliestDate: null });
    expect(syncing.getByTestId('heatmap-history-note')).toHaveTextContent('Your step history is still syncing.');
  });
});

describe('ActivityHeatmap: days and nights', () => {
  it('opens a day sheet when a steps day is tapped, and says so when it has no record', () => {
    const { getByTestId } = renderHeatmap([
      ['2026-09-21', 8000],
      ['2026-09-22', 12000],
    ]);

    fireEvent.press(getByTestId('activity-cal-2026-09-22'));
    expect(getByTestId('day-detail-steps')).toHaveTextContent('12,000 steps');
    expect(getByTestId('day-detail-goal')).toHaveTextContent('120% of your 10,000-step goal');
  });

  it('says so when a tapped day has no record', () => {
    const { getByTestId } = renderHeatmap([]);
    fireEvent.press(getByTestId('activity-cal-2026-09-20'));
    expect(getByTestId('day-detail-empty')).toHaveTextContent('No steps were recorded for this day.');
  });

  it('opens that night on the Sleep page from the Sleep tab, with no sheet', () => {
    const onOpenNight = jest.fn();
    const utils = renderHeatmap([], { sleep: sleepOf([nightOf('2026-09-22', 467, { sleepScore: 71 })]), onOpenNight });

    fireEvent.press(utils.getByTestId('activity-tab-sleep'));
    measure(utils);
    fireEvent.press(utils.getByTestId('activity-cal-2026-09-22'));
    expect(onOpenNight).toHaveBeenCalledWith('2026-09-22');
    expect(utils.queryByTestId('day-detail')).toBeNull();
  });

  it("the steps sheet's sleep link closes the sheet, then opens the night", () => {
    const onOpenNight = jest.fn();
    const { getByTestId, queryByTestId } = renderHeatmap([['2026-09-22', 12000]], { sleep: sleepOf([nightOf('2026-09-22', 467)]), onOpenNight });

    fireEvent.press(getByTestId('activity-cal-2026-09-22'));
    expect(getByTestId('day-detail-sleep-link')).toHaveTextContent(/7h 47m/);
    fireEvent.press(getByTestId('day-detail-sleep-link'));
    // The sheet is a Modal: it closes so it can't sit above the pushed screen.
    expect(queryByTestId('day-detail')).toBeNull();
    expect(onOpenNight).toHaveBeenCalledWith('2026-09-22');
  });

  it('a date handed in opens its steps sheet once, on its month', () => {
    const onOpenedDate = jest.fn();
    const { getByTestId } = renderHeatmap([['2026-08-14', 9000]], { openDate: '2026-08-14', onOpenedDate });

    expect(getByTestId('day-detail-steps')).toHaveTextContent('9,000 steps');
    expect(getByTestId('heatmap-title')).toHaveTextContent('August 2026');
    expect(getByTestId('activity-tab-steps').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(onOpenedDate).toHaveBeenCalledTimes(1);
  });

  it('hides the sleep link on a steps day while sleep is unavailable', () => {
    const { getByTestId, queryByTestId } = renderHeatmap([['2026-09-22', 5000]], { sleep: { phase: 'loading' } });
    fireEvent.press(getByTestId('activity-cal-2026-09-22'));
    expect(getByTestId('day-detail-steps')).toBeTruthy();
    expect(queryByTestId('day-detail-sleep-link')).toBeNull();
  });
});

describe('ActivityHeatmap: month stats', () => {
  it('shows the six step stats for the visible range', () => {
    const { getByTestId } = renderHeatmap([
      ['2026-08-31', 50000], // outside September
      ['2026-09-19', 10000],
      ['2026-09-20', 11000],
      ['2026-09-21', 12000],
      ['2026-09-22', 3000],
    ]);

    expect(getByTestId('stat-total')).toHaveTextContent('36,000');
    expect(getByTestId('stat-average')).toHaveTextContent('9,000');
    expect(getByTestId('stat-active')).toHaveTextContent('4');
    expect(getByTestId('stat-streak')).toHaveTextContent('3 days');
    expect(getByTestId('stat-best')).toHaveTextContent('12,000');
    expect(getByTestId('stat-best-date')).toHaveTextContent('Mon, Sep 21');

    // The year view's range includes August 31st.
    fireEvent.press(getByTestId('heatmap-view-year'));
    expect(getByTestId('stat-total')).toHaveTextContent('86,000');
  });

  it('shows sleep stats on the Sleep tab', () => {
    const { getByTestId } = renderHeatmap([], {
      sleep: sleepOf([nightOf('2026-09-20', 490), nightOf('2026-09-21', 500), nightOf('2026-09-22', 480)]),
    });

    fireEvent.press(getByTestId('activity-tab-sleep'));
    expect(getByTestId('stat-average')).toHaveTextContent('8h 10m');
    expect(getByTestId('stat-active')).toHaveTextContent('3');
    expect(getByTestId('stat-streak')).toHaveTextContent('3 nights');
    expect(getByTestId('stat-best')).toHaveTextContent('8h 20m');
  });

  it('counts main sleep on the Sleep tab and skips nap-only dates', () => {
    const { getByTestId } = renderHeatmap([], {
      sleep: sleepOf([nightOf('2026-09-21', 500, { mainMinutesAsleep: 467 }), nightOf('2026-09-22', 45, { mainMinutesAsleep: 45, mainIsNap: true })]),
    });
    fireEvent.press(getByTestId('activity-tab-sleep'));

    expect(getByTestId('stat-average')).toHaveTextContent('7h 47m');
    expect(getByTestId('stat-active')).toHaveTextContent('1');
  });

  it('follows a tab the page hands it, and reports a tab press', () => {
    const onTab = jest.fn();
    const { getByTestId } = renderHeatmap([], { tab: 'sleep', onTab });
    expect(getByTestId('activity-tab-sleep').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    fireEvent.press(getByTestId('activity-tab-recovery'));
    expect(onTab).toHaveBeenCalledWith('recovery');
  });

  it('keeps the stat numbers tabular on one line that shrinks to fit, three to a row', () => {
    const { getByTestId } = renderHeatmap([['2026-09-19', 1234567]]);
    const total = getByTestId('stat-total');
    expect(StyleSheet.flatten(total.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] }));
    expect(total.props.numberOfLines).toBe(1);
    expect(total.props.adjustsFontSizeToFit).toBe(true);
    expect(String(getByTestId('stat-total-tile').props.className)).toContain('w-[31%]');
  });
});

describe('ActivityHeatmap: the Recovery tab', () => {
  const scores: [string, number][] = [
    ['2026-09-20', 85],
    ['2026-09-21', 30],
    ['2026-09-22', 65],
  ];

  it('colours each day by recovery band', () => {
    const utils = renderHeatmap([], { recovery: recoveryOf(scores) });
    fireEvent.press(utils.getByTestId('activity-tab-recovery'));
    measure(utils);

    const fills = within(utils.getByTestId('heatmap-canvas'))
      .UNSAFE_getAllByType(Rect)
      .slice(19)
      .map((r) => r.props.fill);
    expect([COLORS.light.scoreExcellent, COLORS.dark.scoreExcellent]).toContain(fills[0]);
    expect([COLORS.light.scorePoor, COLORS.dark.scorePoor]).toContain(fills[1]);
    expect([COLORS.light.scoreGood, COLORS.dark.scoreGood]).toContain(fills[2]);
  });

  it('shows Average, Best day, Best date, Days scored, Clear days and Stormy days', () => {
    const { getByTestId } = renderHeatmap([], { recovery: recoveryOf(scores) });
    fireEvent.press(getByTestId('activity-tab-recovery'));

    expect(getByTestId('stat-average')).toHaveTextContent('60');
    expect(getByTestId('stat-best')).toHaveTextContent('85');
    expect(getByTestId('stat-best-date')).toHaveTextContent('Sun, Sep 20');
    expect(getByTestId('stat-scored')).toHaveTextContent('3');
    expect(getByTestId('stat-clear')).toHaveTextContent('1');
    expect(getByTestId('stat-stormy')).toHaveTextContent('1');
  });

  it('opens Recovery on a tapped day', () => {
    const onOpenRecovery = jest.fn();
    const utils = renderHeatmap([], { recovery: recoveryOf(scores), onOpenRecovery });
    fireEvent.press(utils.getByTestId('activity-tab-recovery'));
    measure(utils);

    fireEvent.press(utils.getByTestId('activity-cal-2026-09-21'));
    expect(onOpenRecovery).toHaveBeenCalledWith('2026-09-21');
    expect(utils.queryByTestId('day-detail')).toBeNull();
  });

  it('says how far back Recovery goes when the range starts before it', () => {
    const { getByTestId, queryByTestId } = renderHeatmap([], { recovery: recoveryOf(scores) });
    fireEvent.press(getByTestId('activity-tab-recovery'));
    expect(queryByTestId('heatmap-history-note')).toBeNull();

    fireEvent.press(getByTestId('heatmap-view-year'));
    expect(getByTestId('heatmap-history-note')).toHaveTextContent('Recovery shows your last 120 days.');
  });
});

describe('ActivityHeatmap: sections fail on their own', () => {
  it('offers a retry on the Sleep tab when sleep failed, while steps still work', () => {
    const retry = jest.fn();
    const { getByTestId } = renderHeatmap([['2026-09-22', 5000]], { sleep: { phase: 'error' }, onRetrySleep: retry });

    expect(getByTestId('stat-total')).toHaveTextContent('5,000');
    fireEvent.press(getByTestId('activity-tab-sleep'));
    fireEvent.press(getByTestId('sleep-retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('offers a retry on the Recovery tab when Recovery failed', () => {
    const retry = jest.fn();
    const { getByTestId } = renderHeatmap([], { recovery: { phase: 'error' }, onRetryRecovery: retry });

    fireEvent.press(getByTestId('activity-tab-recovery'));
    fireEvent.press(getByTestId('recovery-retry'));
    expect(retry).toHaveBeenCalled();
  });
});
