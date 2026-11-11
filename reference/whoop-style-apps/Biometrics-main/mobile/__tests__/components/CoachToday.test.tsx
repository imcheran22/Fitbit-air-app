import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import type { TodayBarDTO, TodaySummaryDTO } from '../../src/api/coach';
import { CoachToday } from '../../src/components/coach/CoachToday';
import { TodayBar, bareUsual } from '../../src/components/coach/TodayBar';
import { barQuestion, spanQuestion } from '../../src/lib/coachToday';
import { COLORS } from '../../src/theme';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({ colorScheme: mockScheme, setColorScheme: jest.fn(), toggleColorScheme: jest.fn() }),
}));

const style = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

const recovery: TodayBarDTO = {
  metric: 'recovery',
  label: 'Recovery',
  value: 26,
  usual: 58,
  unit: 'score',
  display: '26',
  usualDisplay: '58',
  status: 'below',
  scaleMax: 100,
};
const sleep: TodayBarDTO = {
  metric: 'sleep',
  label: 'Sleep',
  value: 408,
  usual: 433,
  unit: 'minutes',
  display: '6h 48m',
  usualDisplay: '7h 13m',
  status: 'near',
  scaleMax: 606.2,
};
// Server-shaped displays (formatValue): HRV and resting HR carry their units.
const hrv: TodayBarDTO = { ...recovery, metric: 'hrv', label: 'HRV', value: 63.4, usual: 52.3, unit: 'ms', display: '63.4 ms', usualDisplay: '52.3 ms', status: 'above', scaleMax: 88.8 };
const rhr: TodayBarDTO = { ...recovery, metric: 'rhr', label: 'Rest HR', value: 58, usual: 58, unit: 'bpm', display: '58 bpm', usualDisplay: '58 bpm', status: 'near', scaleMax: 81.2 };

const summary: TodaySummaryDTO = {
  date: '2026-09-30',
  hasData: true,
  sentence: {
    text: "Recovery's 26, about half your usual. A short night pulled your HRV down.",
    spans: [
      { text: "Recovery's " },
      { text: '26', metric: 'recovery' },
      { text: ', about half your usual. A ' },
      { text: 'short night', metric: 'sleep' },
      { text: ' pulled your HRV down.' },
    ],
    source: 'ai',
  },
  bars: [recovery, sleep, hrv, rhr],
};

beforeEach(() => {
  mockScheme = 'light';
});

describe('TodayBar', () => {
  it('fills to the value on its scale, ticks the usual, and reads "value / N"', () => {
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={() => {}} />);

    expect(style(getByTestId('today-bar-fill-recovery')).width).toBe('26%');
    expect(style(getByTestId('today-bar-tick-recovery')).left).toBe('58%');
    expect(getByTestId('today-bar-recovery')).toHaveTextContent('Recovery26 / 58');
  });

  it('colours by status: rose below, teal above, neutral near, violet for sleep near usual', () => {
    const colours = [recovery, hrv, rhr, sleep].map((bar) => {
      const { getByTestId, unmount } = render(<TodayBar bar={bar} onPress={() => {}} />);
      const colour = style(getByTestId(`today-bar-fill-${bar.metric}`)).backgroundColor;
      unmount();
      return colour;
    });
    expect(colours).toEqual([COLORS.light.statusBelow, COLORS.light.statusAbove, COLORS.light.statusNear, COLORS.light.metricSleep]);
  });

  it('uses the dark palette in dark mode', () => {
    mockScheme = 'dark';
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={() => {}} />);

    expect(style(getByTestId('today-bar-fill-recovery')).backgroundColor).toBe(COLORS.dark.statusBelow);
    expect(style(getByTestId('today-bar-tick-recovery')).backgroundColor).toBe(COLORS.dark.todayTick);
  });

  it('draws the usual tick taller than the track so it shows over any fill (R36)', () => {
    const { getByTestId } = render(<TodayBar bar={{ ...recovery, value: 90 }} onPress={() => {}} />);
    const tick = getByTestId('today-bar-tick-recovery');
    const track = getByTestId('today-bar-track-recovery');

    expect(style(tick).height as number).toBeGreaterThan(style(track).height as number);
  });

  it('colours the small value numbers with the text-safe status colours (R40)', () => {
    const colours = (scheme: 'light' | 'dark') =>
      [recovery, hrv, rhr, sleep].map((bar) => {
        mockScheme = scheme;
        const { getByTestId, unmount } = render(<TodayBar bar={bar} onPress={() => {}} />);
        const colour = style(getByTestId(`today-bar-value-${bar.metric}`)).color;
        unmount();
        return colour;
      });
    const p = COLORS.light;
    const d = COLORS.dark;
    expect(colours('light')).toEqual([p.statusBelowText, p.statusAboveText, p.foreground, p.foreground]);
    expect(colours('dark')).toEqual([d.statusBelowText, d.statusAboveText, d.foreground, d.foreground]);
  });

  it('sets the value in caption bold tabular figures and the usual in caption, in the dimmer usual colour', () => {
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={() => {}} />);
    const classes = (id: string) => String(getByTestId(id).props.className).split(' ');

    expect(classes('today-bar-value-recovery')).toEqual(expect.arrayContaining(['text-caption', 'font-bold', 'tabular-nums']));
    expect(classes('today-bar-usual-recovery')).toEqual(expect.arrayContaining(['text-caption', 'tabular-nums']));
    expect(style(getByTestId('today-bar-usual-recovery')).color).toBe(COLORS.light.todayUsual);
    // One line: a value that does not fit truncates rather than wrapping the row.
    expect(getByTestId('today-bar-text-recovery').props.numberOfLines).toBe(1);
  });

  // R42: the value keeps its unit; the usual is a bare number (durations keep h/m),
  // and a screen reader still hears the full words.
  it('shows the usual as a bare number after the value and its unit, but says it in full', () => {
    const cases: Array<[TodayBarDTO, string]> = [
      [recovery, '26 / 58'],
      [sleep, '6h 48m / 7h 13m'],
      [hrv, '63.4 ms / 52.3'],
      [rhr, '58 bpm / 58'],
    ];
    for (const [bar, text] of cases) {
      const { getByTestId, unmount } = render(<TodayBar bar={bar} onPress={() => {}} />);
      expect(getByTestId(`today-bar-text-${bar.metric}`)).toHaveTextContent(text, { exact: true });
      unmount();
    }
    const label = (bar: TodayBarDTO) => {
      const { getByTestId, unmount } = render(<TodayBar bar={bar} onPress={() => {}} />);
      const value = getByTestId(`today-bar-${bar.metric}`).props.accessibilityLabel as string;
      unmount();
      return value;
    };
    expect(label(sleep)).toContain('usual 7 hours 13 minutes');
    expect(label(hrv)).toBe('HRV 63.4 milliseconds, usual 52.3 milliseconds. Higher than usual.');
    expect(label(rhr)).toBe('Rest HR 58 beats per minute, usual 58 beats per minute. About usual.');
  });

  it('strips only a trailing unit from the usual', () => {
    expect(bareUsual({ unit: 'ms', usualDisplay: '98.7 ms' })).toBe('98.7');
    expect(bareUsual({ unit: 'bpm', usualDisplay: '55 bpm' })).toBe('55');
    expect(bareUsual({ unit: 'percent', usualDisplay: '26%' })).toBe('26');
    expect(bareUsual({ unit: 'minutes', usualDisplay: '7h 13m' })).toBe('7h 13m');
    expect(bareUsual({ unit: 'score', usualDisplay: '58' })).toBe('58');
    expect(bareUsual({ unit: 'score', usualDisplay: null })).toBeNull();
  });

  // Measured in Geist at the type scale's 13px bold value / 13px usual, tabular figures:
  // "10h 48m / 7h 13m" 114.0pt is the widest; "103.4 ms / 98.7" 96.8pt, "103 bpm / 98"
  // 84.0pt, "100 / 100" 60.9pt; so the column is 120.
  it('gives every row the same 120pt value column, wide enough for the longest value', () => {
    for (const bar of [recovery, sleep, hrv, rhr]) {
      const { getByTestId, unmount } = render(<TodayBar bar={bar} onPress={() => {}} />);
      expect(style(getByTestId(`today-bar-text-${bar.metric}`)).width).toBe(120);
      unmount();
    }
  });

  it('caps how far large text grows the value column', () => {
    const { getByTestId } = render(<TodayBar bar={hrv} onPress={() => {}} />);

    expect(getByTestId('today-bar-value-hrv').props.maxFontSizeMultiplier).toBe(1.3);
    expect(getByTestId('today-bar-usual-hrv').props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('is a 36pt row whose tap area stays inside the 8pt gap to its neighbours', () => {
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={() => {}} />);
    const row = getByTestId('today-bar-recovery');

    expect(style(row).minHeight).toBe(36);
    expect(row.props.hitSlop).toEqual({ top: 3, bottom: 3, left: 4, right: 4 });
  });

  it('says higher or lower by the number for resting HR, and near as about usual', () => {
    const rhrHigh = { ...rhr, value: 66, display: '66 bpm', status: 'below' as const };
    const a = render(<TodayBar bar={rhrHigh} onPress={() => {}} />);
    expect(a.getByTestId('today-bar-rhr').props.accessibilityLabel).toBe('Rest HR 66 beats per minute, usual 58 beats per minute. Higher than usual.');
    a.unmount();
    const b = render(<TodayBar bar={sleep} onPress={() => {}} />);
    expect(b.getByTestId('today-bar-sleep').props.accessibilityLabel).toBe('Sleep 6 hours 48 minutes, usual 7 hours 13 minutes. About usual.');
  });

  it('draws no tick when there is no usual yet', () => {
    const { queryByTestId, getByTestId } = render(<TodayBar bar={{ ...recovery, usual: null, usualDisplay: null, status: null }} onPress={() => {}} />);

    expect(queryByTestId('today-bar-tick-recovery')).toBeNull();
    expect(getByTestId('today-bar-recovery')).toHaveTextContent('Recovery26');
  });

  it('is a button that says what it shows and passes itself to onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={onPress} />);
    const button = getByTestId('today-bar-recovery');

    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Recovery 26, usual 58. Lower than usual.');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledWith(recovery);
  });
});

describe('CoachToday', () => {
  it('shows the sentence with the metric words underlined, the four bars and the footnote', () => {
    const { getByTestId, getAllByTestId } = render(<CoachToday summary={summary} loading={false} onAsk={() => {}} />);

    expect(getByTestId('coach-today-sentence')).toHaveTextContent(summary.sentence!.text);
    expect(style(getByTestId('today-span-recovery')).textDecorationLine).toBe('underline');
    expect(style(getByTestId('today-span-recovery')).color).toBe(COLORS.light.statusBelowText);
    expect(getAllByTestId(/^today-bar-(recovery|sleep|hrv|rhr)$/)).toHaveLength(4);
    expect(getByTestId('coach-today-footnote')).toHaveTextContent('Comparisons against your own readings, not medical advice.');
  });

  it('asks about a bar when it is tapped, worded by its status', () => {
    const onAsk = jest.fn();
    const { getByTestId } = render(<CoachToday summary={summary} loading={false} onAsk={onAsk} />);

    fireEvent.press(getByTestId('today-bar-recovery'));
    fireEvent.press(getByTestId('today-bar-hrv'));
    fireEvent.press(getByTestId('today-bar-sleep'));

    // R37: the wording is coachToday.ts's, so assert against it.
    expect(onAsk.mock.calls).toEqual([[barQuestion(recovery)], [barQuestion(hrv)], [barQuestion(sleep)]]);
    expect(onAsk.mock.calls[0]).toEqual(['Why is my recovery lower than usual today?']);
  });

  it('asks about an underlined word when it is tapped', () => {
    const onAsk = jest.fn();
    const { getByTestId } = render(<CoachToday summary={summary} loading={false} onAsk={onAsk} />);
    const span = getByTestId('today-span-sleep');

    // 'link' so Android makes the nested span focusable (R40).
    expect(span.props.accessibilityRole).toBe('link');
    fireEvent.press(span);

    expect(onAsk).toHaveBeenCalledWith(spanQuestion('sleep', summary.bars));
  });

  it('shows the bars without a sentence when the server sends none', () => {
    const { getByTestId, queryByTestId } = render(<CoachToday summary={{ ...summary, sentence: null }} loading={false} onAsk={() => {}} />);

    expect(queryByTestId('coach-today-sentence')).toBeNull();
    expect(getByTestId('coach-today-bars')).toBeTruthy();
    expect(getByTestId('coach-today-footnote')).toBeTruthy();
  });

  it('shows nothing, not a lone footnote, when there is neither a sentence nor a bar', () => {
    const { toJSON } = render(<CoachToday summary={{ ...summary, sentence: null, bars: [] }} loading={false} onAsk={() => {}} />);

    expect(toJSON()).toBeNull();
  });

  it('gives the bars one stable press handler across re-renders', () => {
    const onAsk = jest.fn();
    // The memoised TodayBar elements: the nodes holding both `bar` and `onPress`.
    const handlers = (root: ReturnType<typeof render>['UNSAFE_root']) =>
      root.findAll((node) => node.props.bar !== undefined && typeof node.props.onPress === 'function').map((node) => node.props.onPress);
    const { UNSAFE_root, rerender } = render(<CoachToday summary={summary} loading={false} onAsk={onAsk} />);
    const before = handlers(UNSAFE_root);
    rerender(<CoachToday summary={summary} loading onAsk={onAsk} />);

    expect(before.length).toBeGreaterThanOrEqual(4);
    expect(handlers(UNSAFE_root)).toEqual(before);
    expect(new Set(before).size).toBe(1);
  });

  it('shows skeleton bars while loading', () => {
    const { getByTestId, queryByTestId } = render(<CoachToday summary={null} loading onAsk={() => {}} />);

    expect(getByTestId('coach-today-loading')).toBeTruthy();
    expect(queryByTestId('coach-today-sentence')).toBeNull();
    // The same value column as a real row, so the tracks keep their length when data arrives.
    expect(style(getByTestId('today-bar-skeleton-value-0')).width).toBe(120);
  });

  it('keeps showing the last summary while it refreshes', () => {
    const { getByTestId, queryByTestId } = render(<CoachToday summary={summary} loading onAsk={() => {}} />);

    expect(getByTestId('coach-today-sentence')).toBeTruthy();
    expect(queryByTestId('coach-today-loading')).toBeNull();
  });

  it('says what will appear, with no bars, before the first night syncs', () => {
    const { getByTestId, queryByTestId } = render(
      <CoachToday summary={{ date: '2026-09-30', hasData: false, sentence: null, bars: [] }} loading={false} onAsk={() => {}} />,
    );

    expect(getByTestId('coach-today-empty')).toHaveTextContent("Once your first night syncs, I'll sum up your day here.");
    expect(queryByTestId('today-bar-recovery')).toBeNull();
    expect(queryByTestId('coach-today-footnote')).toBeNull();
  });

  it('shows nothing when the summary could not be loaded', () => {
    const { toJSON } = render(<CoachToday summary={null} loading={false} onAsk={() => {}} />);

    expect(toJSON()).toBeNull();
  });
});
