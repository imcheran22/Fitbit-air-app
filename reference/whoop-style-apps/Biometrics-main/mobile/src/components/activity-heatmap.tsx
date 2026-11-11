import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { ScoreBandsDTO } from '../api/scores';
import { COLORS, METRIC_CONFIG, MOTION } from '../theme';
import { ACTIVITY_COPY, type CalendarTab } from '../lib/activityCopy';
import { recoveryLevel, recoveryStats } from '../lib/activityWeek';
import {
  cellAt,
  daysBetween,
  gridGeometry,
  heatLevel,
  historyNote,
  monthGrid,
  monthLabels,
  monthStart,
  monthTitle,
  rangeStats,
  shiftMonth,
  sleepHeatLevel,
  viewRange,
  weekColumnsGrid,
  yearStart,
  type HeatCell,
  type HeatGrid,
  type HeatLevel,
  type HeatmapView,
  type LevelOf,
  type StepsByDate,
  type ValuesByDate,
} from '../lib/heatmap';
import { weatherFor, type WeatherKey } from '../lib/recoveryCopy';
import { DEFAULT_SCORE_BANDS } from '../lib/scoreInsights';
import { formatDuration, mainSleepByDate, type SleepByDate } from '../lib/sleepStats';
import { DayDetail } from './activity-sheets';
import { WeatherIcon } from './recovery/WeatherIcon';
import { SectionError } from './sleep/Section';
import { Button, buttonIconSize } from './ui/button';
import { Card } from './ui/card';
import { SegmentedControl } from './ui/segmented-control';
import { Sheet } from './ui/sheet';
import { Skeleton } from './ui/skeleton';
import { Text } from './ui/text';

const COPY = ACTIVITY_COPY;
const VIEW_OPTIONS: { value: HeatmapView; label: string }[] = [
  { value: 'month', label: COPY.views.month },
  { value: 'year', label: COPY.views.year },
  { value: 'ytd', label: COPY.views.ytd },
];
const TABS: CalendarTab[] = ['steps', 'sleep', 'recovery'];
const LEGEND_WEATHER: WeatherKey[] = ['clear', 'mostlyClear', 'cloudy', 'stormy'];

// Month is a roomy calendar of large squares; Year/YTD are compact week columns
// of small squares that scroll sideways when a year does not fit the screen.
const MONTH_GEOMETRY = { minBin: 28, maxBin: 52, gap: 6 };
const WEEKS_GEOMETRY = { minBin: 13, maxBin: 20, gap: 3 };
// Cells re-reveal in groups of columns (rows, for a month) rather than one by
// one, so a year does not schedule 371 separate animations.
const WEEK_COLUMNS_PER_GROUP = 8;
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABEL_HEIGHT = 16;
// A month cell's weather icon: one point per pixel of the 11x11 art.
const CELL_ICON = 11;

type Palette = (typeof COLORS)['dark'];

export type SleepState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; nights: SleepByDate; earliestDate: string | null };

// `from`: the oldest day the scores were read from (the server serves a limited window).
export type RecoveryCalendarState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; scores: ValuesByDate; bands: ScoreBandsDTO; from: string };

interface TabSpec {
  tab: CalendarTab;
  goal: number;
  levelOf: LevelOf;
  ramp: (p: Palette) => readonly [string, string, string, string, string];
  accent: (p: Palette) => string;
}

const STEPS_SPEC: TabSpec = {
  tab: 'steps',
  goal: METRIC_CONFIG.STEPS.goal ?? 10000,
  levelOf: heatLevel,
  ramp: (p) => [p.heat0, p.heat1, p.heat2, p.heat3, p.heat4],
  accent: (p) => p.metricSteps,
};

const SLEEP_SPEC: TabSpec = {
  tab: 'sleep',
  goal: METRIC_CONFIG.SLEEP.goal ?? 480,
  levelOf: sleepHeatLevel,
  ramp: (p) => [p.heat0, p.sleepHeat1, p.sleepHeat2, p.sleepHeat3, p.sleepHeat4],
  accent: (p) => p.metricSleep,
};

function recoverySpec(bands: ScoreBandsDTO): TabSpec {
  return {
    tab: 'recovery',
    goal: 0,
    levelOf: recoveryLevel(bands),
    ramp: (p) => [p.heat0, p.scorePoor, p.scoreFair, p.scoreGood, p.scoreExcellent],
    accent: (p) => p.scoreExcellent,
  };
}

function levelColor(level: HeatLevel | null, palette: Palette, spec: TabSpec): string {
  if (level === null) return palette.heatEmpty;
  return spec.ramp(palette)[level];
}

const formatSteps = METRIC_CONFIG.STEPS.format;

// Corners scale with the square so a month's large tiles and a year's small
// ones read as the same shape; a year square (10-17 dp) stays at 2 dp.
function cornerRadius(side: number): number {
  return Math.max(2, Math.round(side * 0.14));
}

interface CellGroupProps {
  cells: HeatCell[];
  // 'tile': a month's large squares (outlined when empty, today ringed, tapped day grows);
  // 'rect': a year's compact week-column squares.
  shape: 'tile' | 'rect';
  bin: number;
  gap: number;
  width: number;
  height: number;
  palette: Palette;
  spec: TabSpec;
  selectedDate: string | null;
  today: string;
}

// One Svg layer per reveal group; memoised so opening the day sheet (which
// only changes the selection) does not redraw every other group.
const CellGroup = memo(function CellGroup({ cells, shape, bin, gap, width, height, palette, spec, selectedDate, today }: CellGroupProps) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {cells.map((c) => {
        const fill = levelColor(c.level, palette, spec);
        const selected = c.date === selectedDate;
        const month = shape === 'tile';
        const ringed = selected || (month && c.date === today);
        // A month's tapped day grows to fill its bin while its sheet is open.
        const inset = month && selected ? gap / 4 : gap / 2;
        const side = bin - inset * 2;
        return (
          <Rect
            key={c.date}
            x={c.col * bin + inset}
            y={c.row * bin + inset}
            width={side}
            height={side}
            rx={cornerRadius(side)}
            fill={fill}
            stroke={ringed ? palette.foreground : month && c.level === null ? palette.hairline : undefined}
            strokeWidth={ringed ? (month ? 2 : 1.5) : month ? 1 : 0}
          />
        );
      })}
    </Svg>
  );
});

function groupCells(grid: HeatGrid, view: HeatmapView): HeatCell[][] {
  const groups: HeatCell[][] = [];
  for (const c of grid.cells) {
    const g = view === 'month' ? c.row : Math.floor(c.col / WEEK_COLUMNS_PER_GROUP);
    (groups[g] ??= []).push(c);
  }
  return groups.filter(Boolean);
}

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    // A label may wrap to two lines; the values of a row still line up along the bottom.
    <View testID={`${testID}-tile`} className="w-[31%] grow justify-between gap-0.5 rounded-tile border border-border bg-background px-2 py-2">
      <Text className="text-caption text-muted-foreground">{label}</Text>
      <Text testID={testID} className="text-body font-semibold tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

interface CalendarCardProps {
  spec: TabSpec;
  values: ValuesByDate;
  // Recovery by date, for each month cell's weather icon and label.
  recovery: { scores: ValuesByDate; bands: ScoreBandsDTO } | null;
  today: string;
  view: HeatmapView;
  monthCursor: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
  gridLabel: string;
  note: string | null;
}

// One tab's calendar: month squares with a day number and weather, or a year of week columns.
function CalendarGrid({ spec, values, recovery, today, view, monthCursor, selectedDate, onSelect, gridLabel, note }: CalendarCardProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme !== 'light';
  const palette = dark ? COLORS.dark : COLORS.light;
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const range = viewRange(view, today, monthCursor);
  const grid = useMemo(
    () =>
      view === 'month'
        ? monthGrid(monthCursor, today, values, spec.goal, spec.levelOf)
        : weekColumnsGrid(range.start, range.end, values, spec.goal, spec.levelOf),
    [view, monthCursor, today, values, spec, range.start, range.end],
  );
  const groups = useMemo(() => groupCells(grid, view), [grid, view]);
  const labels = useMemo(() => (view === 'month' ? [] : monthLabels(grid)), [grid, view]);
  const geometry = gridGeometry(grid, width, view === 'month' ? MONTH_GEOMETRY : WEEKS_GEOMETRY);
  const top = view === 'month' ? 0 : MONTH_LABEL_HEIGHT;

  function onGridPress(e: GestureResponderEvent) {
    const hit = cellAt(grid, geometry.bin, e.nativeEvent.locationX, e.nativeEvent.locationY - top);
    if (hit) onSelect(hit.date);
  }

  const weatherOf = (date: string) => {
    const score = recovery?.scores.get(date);
    return score === undefined || !recovery ? null : { score, weather: weatherFor(score, 'READY', recovery.bands) };
  };

  const squares = (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top }}>
      {groups.map((cells, g) => (
        <Animated.View
          // Keyed by what is shown, so switching tab, view or month re-reveals the cells.
          key={`${spec.tab}-${view}-${monthCursor}-${g}`}
          entering={reduced ? undefined : FadeIn.delay(g * MOTION.stagger).duration(MOTION.duration.normal)}
          style={{ position: 'absolute', left: 0, top: 0, width: geometry.width, height: geometry.height }}
          pointerEvents="none"
        >
          <CellGroup
            cells={cells}
            shape={view === 'month' ? 'tile' : 'rect'}
            bin={geometry.bin}
            gap={geometry.gap}
            width={geometry.width}
            height={geometry.height}
            palette={palette}
            spec={spec}
            selectedDate={selectedDate}
            today={today}
          />
        </Animated.View>
      ))}
    </View>
  );

  let body: React.ReactNode = null;
  if (width > 0 && view === 'month') {
    const side = geometry.bin - geometry.gap;
    body = (
      <View className="items-center gap-1">
        <View className="flex-row" style={{ width: geometry.width }} accessible={false} importantForAccessibility="no-hide-descendants">
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text key={i} className="text-center text-fine text-muted-foreground" style={{ width: geometry.bin }}>
              {d}
            </Text>
          ))}
        </View>
        <View testID="heatmap-grid" style={{ width: geometry.width, height: geometry.height }}>
          {squares}
          {grid.cells.map((c) => {
            const wx = weatherOf(c.date);
            const strong = c.level !== null && c.level >= 3 && dark;
            return (
              <Pressable
                key={c.date}
                testID={`activity-cal-${c.date}`}
                accessibilityRole="button"
                accessibilityLabel={COPY.cellLabel(spec.tab, c.date, c.value, wx)}
                onPress={() => onSelect(c.date)}
                className="justify-between p-1"
                style={{ position: 'absolute', left: c.col * geometry.bin + geometry.gap / 2, top: c.row * geometry.bin + geometry.gap / 2, width: side, height: side }}
              >
                <Text className="text-fine tabular-nums" style={{ color: strong ? palette.background : c.level === null ? palette.muted : palette.foreground }}>
                  {Number(c.date.slice(8, 10))}
                </Text>
                {wx ? (
                  <View className="self-end">
                    <WeatherIcon kind={wx.weather} variant="small" size={CELL_ICON} testID={`activity-cal-weather-${c.date}`} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  } else if (width > 0) {
    body = (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Open on the most recent weeks: today is at the right edge.
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <Pressable
          testID="heatmap-grid"
          onPress={onGridPress}
          accessibilityRole="image"
          accessibilityLabel={gridLabel}
          style={{ width: geometry.width, height: geometry.height + MONTH_LABEL_HEIGHT }}
        >
          {/* Nothing inside the grid may take the touch: the hit-test reads
              locationX/Y, which are relative to whichever element was touched. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: geometry.width, height: MONTH_LABEL_HEIGHT }}>
            {labels.map((l) => (
              <Text key={`${l.col}-${l.label}`} className="absolute text-fine text-muted-foreground" style={{ left: l.col * geometry.bin, top: 0 }}>
                {l.label}
              </Text>
            ))}
          </View>
          {squares}
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <>
      <View testID="heatmap-canvas" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {body}
      </View>
      <View testID="heatmap-legend" className="flex-row flex-wrap items-center justify-between gap-2">
        {spec.tab !== 'recovery' ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-fine text-muted-foreground">{COPY.legend.less}</Text>
            {([0, 1, 2, 3, 4] as HeatLevel[]).map((level) => (
              <View key={level} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: levelColor(level, palette, spec) }} />
            ))}
            <Text className="text-fine text-muted-foreground">{COPY.legend.more}</Text>
          </View>
        ) : (
          <View />
        )}
        <View testID="heatmap-legend-recovery" className="flex-row items-center gap-1">
          <Text className="text-fine text-muted-foreground">{COPY.legend.recovery}</Text>
          {LEGEND_WEATHER.map((w) =>
            spec.tab === 'recovery' ? (
              <View key={w} className="flex-row items-center gap-0.5">
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: levelColor(LEGEND_WEATHER.length - LEGEND_WEATHER.indexOf(w) as HeatLevel, palette, spec) }} />
                <WeatherIcon kind={w} variant="small" size={CELL_ICON} />
              </View>
            ) : (
              <WeatherIcon key={w} kind={w} variant="small" size={CELL_ICON} />
            ),
          )}
        </View>
      </View>
      {note ? (
        <Text testID="heatmap-history-note" className="text-caption text-muted-foreground">
          {note}
        </Text>
      ) : null}
    </>
  );
}

export interface ActivityHeatmapProps {
  steps: StepsByDate;
  earliestDate: string | null;
  today: string;
  sleep: SleepState;
  recovery: RecoveryCalendarState;
  onRetrySleep?: () => void;
  onRetryRecovery?: () => void;
  // A sleep cell, and the steps sheet's sleep link: the Sleep page on that night.
  onOpenNight?: (date: string) => void;
  // A Recovery day: the Recovery page on that date.
  onOpenRecovery?: (date: string) => void;
  // The saved sleep goal in minutes; 8h when not given.
  sleepGoal?: number;
  // The tab, when the page shares it ("2026 so far" follows it); otherwise the calendar keeps its own.
  tab?: CalendarTab;
  onTab?: (tab: CalendarTab) => void;
  // A date to open on the steps tab, once (the Sleep page's "Steps that day").
  openDate?: string | null;
  onOpenedDate?: () => void;
}

// Activity's calendar (A-1): Steps, Sleep and Recovery tabs over one Month / Year / YTD calendar, then the
// visible range's stats. A steps day opens its sheet, a night the Sleep page, a Recovery day Recovery.
export function ActivityHeatmap({
  steps,
  earliestDate,
  today,
  sleep,
  recovery,
  onRetrySleep,
  onRetryRecovery,
  onOpenNight,
  onOpenRecovery,
  sleepGoal,
  tab: shownTab,
  onTab,
  openDate,
  onOpenedDate,
}: ActivityHeatmapProps) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const [view, setView] = useState<HeatmapView>('month');
  const [monthCursor, setMonthCursor] = useState(() => monthStart(today));
  const [ownTab, setOwnTab] = useState<CalendarTab>('steps');
  const tab = shownTab ?? ownTab;
  const setTab = onTab ?? setOwnTab;
  // The steps sheet's date; a night opens the Sleep page instead.
  const [selection, setSelection] = useState<string | null>(null);

  const firstMonth = monthStart(yearStart(today));
  const lastMonth = monthStart(today);
  const range = viewRange(view, today, monthCursor);
  const year = today.slice(0, 4);
  const rangeLabel = view === 'month' ? monthTitle(monthCursor) : view === 'year' ? COPY.rangeLabel.year : COPY.rangeLabel.ytd(year);

  const sleepSpec = useMemo<TabSpec>(() => (sleepGoal ? { ...SLEEP_SPEC, goal: sleepGoal } : SLEEP_SPEC), [sleepGoal]);
  const nights = sleep.phase === 'ready' ? sleep.nights : null;
  // The calendar shows main sleep and skips nap-only dates (Sleep plan ruling 5).
  const mainNights = useMemo(() => (nights ? mainSleepByDate(nights.values()) : null), [nights]);
  const sleepValues = useMemo<ValuesByDate>(
    () => new Map(mainNights ? [...mainNights].map(([date, n]) => [date, n.minutesAsleep] as const) : []),
    [mainNights],
  );
  const recoveryData = recovery.phase === 'ready' ? { scores: recovery.scores, bands: recovery.bands } : null;
  const bands = recoveryData?.bands ?? DEFAULT_SCORE_BANDS;
  const recSpec = useMemo(() => recoverySpec(bands), [bands]);

  const stepStats = useMemo(() => rangeStats(steps, range.start, range.end, today, STEPS_SPEC.goal), [steps, range.start, range.end, today]);
  const sleepStats = useMemo(
    () => (nights ? rangeStats(sleepValues, range.start, range.end, today, sleepSpec.goal) : null),
    [nights, sleepValues, range.start, range.end, today, sleepSpec.goal],
  );
  const recStats = useMemo(
    () => (recoveryData ? recoveryStats(recoveryData.scores, range.start, range.end, today, bands) : null),
    [recoveryData, range.start, range.end, today, bands],
  );

  // The sheet is a Modal, which would stay above a pushed screen: close it first.
  function openNight(date: string) {
    setSelection(null);
    onOpenNight?.(date);
  }

  function select(date: string) {
    if (tab === 'recovery') onOpenRecovery?.(date);
    else if (tab === 'sleep') openNight(date);
    else setSelection(date);
  }

  // A date handed in from outside opens that day's steps sheet once.
  useEffect(() => {
    if (!openDate) return;
    setView('month');
    setMonthCursor(monthStart(openDate));
    setTab('steps');
    setSelection(openDate);
    onOpenedDate?.();
    // Only when a new date arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDate]);

  const none = COPY.stats.none;
  let calendar: React.ReactNode;
  let stats: React.ReactNode;
  if (tab === 'sleep' && sleep.phase !== 'ready') {
    calendar =
      sleep.phase === 'error' && onRetrySleep ? (
        <SectionError testID="sleep-retry" message={COPY.sleepError} onRetry={onRetrySleep} />
      ) : (
        <Skeleton testID="sleep-loading" className="h-72 w-full rounded-tile" />
      );
  } else if (tab === 'recovery' && recovery.phase !== 'ready') {
    calendar =
      recovery.phase === 'error' && onRetryRecovery ? (
        <SectionError testID="recovery-retry" message={COPY.recoveryError} onRetry={onRetryRecovery} />
      ) : (
        <Skeleton testID="recovery-loading" className="h-72 w-full rounded-tile" />
      );
  } else {
    const spec = tab === 'steps' ? STEPS_SPEC : tab === 'sleep' ? sleepSpec : recSpec;
    const values = tab === 'steps' ? steps : tab === 'sleep' ? sleepValues : recoveryData!.scores;
    const note =
      tab === 'steps'
        ? historyNote(earliestDate, range.start, today, 'step')
        : tab === 'sleep' && sleep.phase === 'ready'
          ? historyNote(sleep.earliestDate, range.start, today, 'sleep')
          : recovery.phase === 'ready' && range.start < recovery.from
            ? COPY.recoveryWindow(daysBetween(recovery.from, today) + 1)
            : null;
    calendar = (
      <CalendarGrid
        spec={spec}
        values={values}
        recovery={recoveryData}
        today={today}
        view={view}
        monthCursor={monthCursor}
        selectedDate={tab === 'steps' ? selection : null}
        onSelect={select}
        gridLabel={COPY.gridLabel(tab, rangeLabel)}
        note={note}
      />
    );
  }

  const S = COPY.stats;
  if (tab === 'steps') {
    stats = [
      <Stat key="t" testID="stat-total" label={S.total} value={formatSteps(stepStats.total)} />,
      <Stat key="a" testID="stat-average" label={S.average} value={stepStats.average === null ? none : formatSteps(stepStats.average)} />,
      <Stat key="d" testID="stat-active" label={S.activeDays} value={String(stepStats.activeDays)} />,
      <Stat key="s" testID="stat-streak" label={S.goalStreak} value={S.days(stepStats.streak)} />,
      <Stat key="b" testID="stat-best" label={S.bestDay} value={stepStats.best ? formatSteps(stepStats.best.steps) : none} />,
      <Stat key="bd" testID="stat-best-date" label={S.bestDate} value={stepStats.best ? S.date(stepStats.best.date) : none} />,
    ];
  } else if (tab === 'sleep' && sleepStats) {
    stats = [
      <Stat key="t" testID="stat-total" label={S.total} value={S.hours(sleepStats.total)} />,
      <Stat key="a" testID="stat-average" label={S.nightlyAverage} value={sleepStats.average === null ? none : formatDuration(sleepStats.average)} />,
      <Stat key="d" testID="stat-active" label={S.nights} value={String(sleepStats.activeDays)} />,
      <Stat key="s" testID="stat-streak" label={S.goalStreak} value={S.nightsCount(sleepStats.streak)} />,
      <Stat key="b" testID="stat-best" label={S.longest} value={sleepStats.best ? formatDuration(sleepStats.best.steps) : none} />,
      <Stat key="bd" testID="stat-best-date" label={S.bestDate} value={sleepStats.best ? S.date(sleepStats.best.date) : none} />,
    ];
  } else if (tab === 'recovery' && recStats) {
    stats = [
      <Stat key="a" testID="stat-average" label={S.recAverage} value={recStats.average === null ? none : String(Math.round(recStats.average))} />,
      <Stat key="b" testID="stat-best" label={S.bestDay} value={recStats.best ? String(recStats.best.score) : none} />,
      <Stat key="bd" testID="stat-best-date" label={S.bestDate} value={recStats.best ? S.date(recStats.best.date) : none} />,
      <Stat key="n" testID="stat-scored" label={S.scored} value={String(recStats.scored)} />,
      <Stat key="c" testID="stat-clear" label={S.clear} value={String(recStats.clear)} />,
      <Stat key="st" testID="stat-stormy" label={S.stormy} value={String(recStats.stormy)} />,
    ];
  } else {
    stats = <Skeleton testID="stats-loading" className="h-40 w-full rounded-tile" />;
  }

  return (
    <View className="gap-3">
      <View accessibilityRole="tablist" accessibilityLabel={COPY.tabsLabel} className="flex-row gap-1.5">
        {TABS.map((t) => {
          const on = tab === t;
          const accent = t === 'steps' ? palette.metricSteps : t === 'sleep' ? palette.metricSleep : palette.scoreExcellent;
          return (
            <Button
              key={t}
              testID={`activity-tab-${t}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              variant={on ? 'default' : 'outline'}
              className="flex-1"
              iconStart={<View style={{ width: 8, height: 8, backgroundColor: accent }} />}
              onPress={() => setTab(t)}
            >
              {COPY.tabs[t]}
            </Button>
          );
        })}
      </View>

      <Card className="gap-3">
        {view === 'month' ? (
          <View className="flex-row items-center justify-between">
            <Button
              testID="heatmap-prev-month"
              variant="ghost"
              size="icon-sm"
              accessibilityLabel={COPY.prevMonth}
              disabled={monthCursor <= firstMonth}
              onPress={() => setMonthCursor(shiftMonth(monthCursor, -1))}
            >
              <Ionicons name="chevron-back" size={buttonIconSize('icon-sm')} color={palette.foreground} />
            </Button>
            <Text testID="heatmap-title" className="text-body font-semibold">
              {monthTitle(monthCursor)}
            </Text>
            <Button
              testID="heatmap-next-month"
              variant="ghost"
              size="icon-sm"
              accessibilityLabel={COPY.nextMonth}
              disabled={monthCursor >= lastMonth}
              onPress={() => setMonthCursor(shiftMonth(monthCursor, 1))}
            >
              <Ionicons name="chevron-forward" size={buttonIconSize('icon-sm')} color={palette.foreground} />
            </Button>
          </View>
        ) : (
          <Text testID="heatmap-title" className="text-body font-semibold">
            {view === 'year' ? COPY.rangeTitle.year : COPY.rangeTitle.ytd(year)}
          </Text>
        )}
        <SegmentedControl testID="heatmap-view" options={VIEW_OPTIONS} value={view} onChange={setView} />
        {calendar}
      </Card>

      <Card testID="heatmap-stats" className="flex-row flex-wrap content-start gap-2 p-3">
        {stats}
      </Card>

      <Sheet testID="day-sheet" visible={selection !== null} onClose={() => setSelection(null)}>
        {selection ? (
          <DayDetail
            date={selection}
            steps={steps.get(selection) ?? null}
            goal={STEPS_SPEC.goal}
            average={stepStats.average}
            sleepLink={nights ? { night: nights.get(selection) ?? null, onPress: () => openNight(selection) } : undefined}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
