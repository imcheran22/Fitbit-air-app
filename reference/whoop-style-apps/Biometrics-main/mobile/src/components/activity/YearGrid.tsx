// The year grid inside "2026 so far" (board A-2): a square per day from 1 January through today in week
// columns, coloured like the calendar's tab, today outlined, months labelled underneath. Drawn as one image;
// the calendar's Year and YTD views are where a day can be opened.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { ACTIVITY_COPY, type CalendarTab } from '../../lib/activityCopy';
import { recoveryLevel } from '../../lib/activityWeek';
import { heatLevel, monthLabels, sleepHeatLevel, viewRange, weekColumnsGrid, type ValuesByDate } from '../../lib/heatmap';
import { DEFAULT_SCORE_BANDS } from '../../lib/scoreInsights';
import type { ScoreBandsDTO } from '../../api/scores';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

type Palette = (typeof COLORS)['dark'];
const GAP = 2;
const MAX_BIN = 12;
const LABEL_HEIGHT = 14;

function rampFor(metric: CalendarTab, p: Palette): readonly string[] {
  if (metric === 'steps') return [p.heat0, p.heat1, p.heat2, p.heat3, p.heat4];
  if (metric === 'sleep') return [p.heat0, p.sleepHeat1, p.sleepHeat2, p.sleepHeat3, p.sleepHeat4];
  return [p.heat0, p.scorePoor, p.scoreFair, p.scoreGood, p.scoreExcellent];
}

export function YearGrid({ metric, values, today, goal, bands = DEFAULT_SCORE_BANDS }: {
  metric: CalendarTab;
  values: ValuesByDate;
  today: string;
  /** Steps and sleep colour against their goal; Recovery by its bands. */
  goal: number;
  bands?: ScoreBandsDTO;
}) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const [width, setWidth] = useState(0);
  const grid = useMemo(() => {
    const levelOf = metric === 'steps' ? heatLevel : metric === 'sleep' ? sleepHeatLevel : recoveryLevel(bands);
    return weekColumnsGrid(viewRange('ytd', today, today).start, today, values, goal, levelOf);
  }, [values, today, goal, metric, bands]);
  const labels = useMemo(() => monthLabels(grid), [grid]);
  const ramp = rampFor(metric, palette);
  const bin = width > 0 ? Math.min(MAX_BIN, Math.floor(width / grid.cols)) : 0;
  const side = bin - GAP;
  const todayCell = grid.cells[grid.cells.length - 1];

  return (
    <View testID="year-grid" accessible accessibilityRole="image" accessibilityLabel={ACTIVITY_COPY.year.gridLabel(metric, today)}>
      <View testID="year-grid-canvas" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: bin * grid.rows }}>
        {bin > GAP ? (
          <Svg width={bin * grid.cols} height={bin * grid.rows}>
            {grid.cells.map((c) => (
              <Rect key={c.date} x={c.col * bin} y={c.row * bin} width={side} height={side} fill={c.level === null ? palette.heatEmpty : ramp[c.level]} />
            ))}
            {todayCell ? (
              <Rect x={todayCell.col * bin - 0.5} y={todayCell.row * bin - 0.5} width={side + 1} height={side + 1} fill="none" stroke={palette.foreground} strokeWidth={1} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View testID="year-grid-months" style={{ height: LABEL_HEIGHT }}>
        {labels.map((l) => (
          <Text key={l.col} className="text-fine text-muted-foreground" style={{ position: 'absolute', left: l.col * bin, top: 0 }}>
            {l.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
