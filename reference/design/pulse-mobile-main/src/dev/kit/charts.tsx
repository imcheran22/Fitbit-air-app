import type { ReactNode } from "react";
import { View } from "react-native";
import { REASON_CODES } from "@/lib/reasons";
import { EnergyBankChart } from "@/ui/charts/EnergyBankChart";
import { Hypnogram } from "@/ui/charts/Hypnogram";
import { IntradayHrChart } from "@/ui/charts/IntradayHrChart";
import { SleepHrChart } from "@/ui/charts/SleepHrChart";
import { StrainRecoveryChart, StrainRecoveryChartSkeleton } from "@/ui/charts/StrainRecoveryChart";
import { StressChart } from "@/ui/charts/StressChart";
import { TrendChart } from "@/ui/charts/TrendChart";
import { ColumnChart } from "@/ui/charts/ColumnChart";
import { ZoneBars } from "@/ui/charts/ZoneBars";
import * as fx from "@/ui/fixtures/kit";
import { Entry, Frame, Group, KitScreen } from "@/ui/kit/KitScreen";

/** One frame with the chart in every reason state (each keeps the chart's height). */
const everyReason = (render: (r: (typeof REASON_CODES)[number]) => ReactNode) => (
  <Frame key="reasons" name="every reason code">
    <View className="gap-3">{REASON_CODES.map((r) => <View key={r}>{render(r)}</View>)}</View>
  </Frame>
);

const HOURS = Array.from({ length: 24 }, (_, i) => ({ label: `${String(i).padStart(2, "0")}:00`, value: i < 6 ? 0 : Math.round(300 + Math.abs(Math.sin(i * 1.7)) * 1500), highlight: i === 12 }));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, title: `${label}day average`, value: [9200, 11200, 8400, 10100, 12800, 6400, 7100][i], highlight: i === 4 }));

export default function KitCharts() {
  return (
    <KitScreen title="Charts" blurb="Skia charts (one Canvas each, text laid over it as React Native Text): the same shapes, colours and labels as the web's Recharts. Drag across a chart, or tap it, to read a point.">
      <Group title="Charts">
        <Entry name="TrendChart" file="src/ui/charts/TrendChart.tsx" use="Every detail screen's trend card, Trends, Fitness and the vital sheets: W, M, 6M bars or a 6M line." props={["label, data: Metric<TrendPoint[]>", "unit, format", "colorBy: band | strain | sleep | single | stress", "direction, deltas", "baseline, target, reference", "fixedRange, defaultRange, ranges"]}>
          <Frame name="recovery by band, normal range shaded, provisional days"><TrendChart label="Recovery" data={fx.ok(fx.recoveryTrend)} unit="%" format="int" colorBy="band" direction="up" deltas={{ w: 4, m: -3, "6m": 2 }} baseline={{ mean: 62, sd: 12 }} /></Frame>
          <Frame name="strain with the Strain Target"><TrendChart label="Strain" data={fx.ok(fx.strainTrend)} unit="%" format="int" colorBy="strain" target={[57, 71]} deltas={{ m: 4 }} /></Frame>
          <Frame name="sleep debt, gaps"><TrendChart label="Sleep debt" data={fx.ok(fx.sleepDebtTrend)} unit="h" format="decimal1" colorBy="sleep" direction="down" deltas={{ m: -0.4 }} /></Frame>
          <Frame name="stress, fixed 30-day range"><TrendChart label="Stress" data={fx.ok(fx.stressTrend)} format="int" colorBy="stress" fixedRange="m" /></Frame>
          <Frame name="6M line with a reference"><TrendChart label="Pulse Age" data={fx.ok(fx.recoveryTrend)} format="int" colorBy="single" fixedRange="6m" reference={{ y: 50, label: "Your age" }} /></Frame>
          <Frame name="empty (no scored days)"><TrendChart label="Recovery" data={fx.ok(fx.emptyTrend)} unit="%" format="int" colorBy="band" /></Frame>
          <Frame name="loading"><TrendChart label="Recovery" data={undefined} format="int" colorBy="band" /></Frame>
          {everyReason((r) => <TrendChart label="Recovery" data={fx.why(r, 4)} format="int" colorBy="band" />)}
          <Frame name="at 320 px" narrow><TrendChart label="Recovery" data={fx.ok(fx.recoveryTrend)} unit="%" format="int" colorBy="band" direction="up" deltas={{ m: -3 }} /></Frame>
        </Entry>
        <Entry name="ColumnChart" file="src/ui/charts/ColumnChart.tsx" use="Category columns: steps by hour, the weekday pattern, weekly totals against a target (metric detail)." props={["summary, data: { label, title?, value, highlight? }[]", "format, unit", "tickEvery", "reference: { y, label }"]}>
          <Frame name="steps by hour, the noon column highlighted"><ColumnChart summary="Steps by hour of the day." data={HOURS} format="grouped" unit="steps" tickEvery={6} /></Frame>
          <Frame name="weekday pattern with a target"><ColumnChart summary="Average steps by weekday." data={WEEKDAYS} format="grouped" reference={{ y: 10000, label: "10,000" }} /></Frame>
        </Entry>
        <Entry name="Hypnogram" file="src/ui/charts/Hypnogram.tsx" use="The four-lane stage chart for a night (Sleep)." props={["data: Metric<HypnogramNight> | null"]}>
          <Frame name="a night"><Hypnogram data={fx.ok(fx.night)} /></Frame>
          <Frame name="no stage data (no segments)"><Hypnogram data={fx.ok({ ...fx.night, segments: [] })} /></Frame>
          <Frame name="loading"><Hypnogram data={undefined} /></Frame>
          {everyReason((r) => <Hypnogram data={fx.why(r, 4)} />)}
          <Frame name="at 320 px" narrow><Hypnogram data={fx.ok(fx.night)} /></Frame>
        </Entry>
        <Entry name="IntradayHrChart" file="src/ui/charts/IntradayHrChart.tsx" use="Strain's day heart rate with sleep and workout spans, and an activity's heart rate by zone." props={["data: Metric<HrSeries>", "variant: day | activity"]}>
          <Frame name="day: spans, a band-off gap, now"><IntradayHrChart data={fx.ok(fx.hrDay)} /></Frame>
          <Frame name="activity"><IntradayHrChart variant="activity" data={fx.ok(fx.hrActivity)} /></Frame>
          <Frame name="empty and loading"><View className="gap-3"><IntradayHrChart data={fx.ok({ points: [] })} /><IntradayHrChart data={undefined} /></View></Frame>
          {everyReason((r) => <IntradayHrChart data={fx.why(r, 4)} />)}
          <Frame name="at 320 px" narrow><IntradayHrChart data={fx.ok(fx.hrDay)} /></Frame>
        </Entry>
        <Entry name="SleepHrChart" file="src/ui/charts/SleepHrChart.tsx" use="Overnight heart rate inside SleepStages; the chosen stage is drawn bright." props={["data: Metric<SleepHr> | null", "highlight: { start, end }[]"]}>
          <Frame name="the whole night lit, a gap"><SleepHrChart data={fx.ok(fx.sleepHr)} /></Frame>
          <Frame name="deep sleep highlighted"><SleepHrChart data={fx.ok(fx.sleepHr)} highlight={fx.night.segments.filter((s) => s.stage === "deep")} /></Frame>
          <Frame name="loading"><SleepHrChart data={undefined} /></Frame>
          {everyReason((r) => <SleepHrChart data={fx.why(r, 4)} />)}
        </Entry>
        <Entry name="StrainRecoveryChart" file="src/ui/charts/StrainRecoveryChart.tsx" use="Home's “Strain & Recovery” week: strain on the left axis, recovery on the right." props={["points: { day, strain, recovery }[]", "today"]}>
          <Frame name="a week with a missing strain and recovery"><StrainRecoveryChart points={fx.strainRecoveryWeek} today={fx.TODAY} /></Frame>
          <Frame name="calibrating: Strain only, peaks and valleys"><StrainRecoveryChart points={fx.strainOnlyWeek} today={fx.TODAY} /></Frame>
          <Frame name="loading"><StrainRecoveryChartSkeleton /></Frame>
          <Frame name="at 320 px" narrow><StrainRecoveryChart points={fx.strainRecoveryWeek} today={fx.TODAY} /></Frame>
        </Entry>
        <Entry name="StressChart" file="src/ui/charts/StressChart.tsx" use="Stress Monitor's day chart (full) and Home's Stress Monitor card (spark)." props={["data: Metric<StressSeries>", "variant: full | spark"]}>
          <Frame name="full"><StressChart variant="full" data={fx.ok(fx.stress)} /></Frame>
          <Frame name="spark"><StressChart variant="spark" data={fx.ok(fx.stress)} /></Frame>
          <Frame name="empty, full and spark"><View className="gap-3"><StressChart variant="full" data={fx.ok({ points: [] })} /><StressChart variant="spark" data={fx.ok({ points: [] })} /></View></Frame>
          <Frame name="loading, full and spark"><View className="gap-3"><StressChart variant="full" data={undefined} /><StressChart variant="spark" data={undefined} /></View></Frame>
          {everyReason((r) => <StressChart variant="spark" data={fx.why(r, 4)} />)}
        </Entry>
        <Entry name="EnergyBankChart" file="src/ui/charts/EnergyBankChart.tsx" use="Home's Energy Bank card: energy left today with drains and naps." props={["data: Metric<EnergySeries> | null"]}>
          <Frame name="a day with drains and a nap"><EnergyBankChart data={fx.ok(fx.energy)} /></Frame>
          <Frame name="empty and loading"><View className="gap-3"><EnergyBankChart data={null} /><EnergyBankChart data={undefined} /></View></Frame>
          {everyReason((r) => <EnergyBankChart data={fx.why(r, 4)} />)}
        </Entry>
        <Entry name="ZoneBars" file="src/ui/charts/ZoneBars.tsx" use="Heart-rate zones on Strain and Activity (rows); Recovery and stress breakdowns in Reports and Stress (stacked). Plain views, not a canvas." props={["variant: rows | stacked", "data", "stacked: unit days | minutes", "note, noteLink, emptyCopy"]}>
          <Frame name="rows, an empty top zone"><ZoneBars variant="rows" data={fx.ok(fx.zones)} note="Zones on your heart-rate reserve: resting 56 to max 186 bpm." /></Frame>
          <Frame name="stacked: days, minutes">
            <View className="gap-6">
              <ZoneBars variant="stacked" unit="days" data={fx.ok(fx.recoveryBreakdown)} />
              <ZoneBars variant="stacked" unit="minutes" data={fx.ok(fx.stressMinutes)} />
            </View>
          </Frame>
          <Frame name="empty and loading">
            <View className="gap-4">
              <ZoneBars variant="rows" data={null} />
              <ZoneBars variant="stacked" unit="days" data={fx.ok([])} />
              <ZoneBars variant="rows" data={undefined} />
              <ZoneBars variant="stacked" unit="days" data={undefined} />
            </View>
          </Frame>
          {everyReason((r) => <ZoneBars variant="rows" data={fx.why(r, 4)} />)}
          <Frame name="rows at 320 px" narrow><ZoneBars variant="rows" data={fx.ok(fx.zones)} note="Zones on your heart-rate reserve: resting 56 to max 186 bpm." /></Frame>
        </Entry>
      </Group>
    </KitScreen>
  );
}
