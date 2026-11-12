// Shared by the Trends page and its loading shape.
import type { TrendRange } from "@/lib/url"
import { TREND_GROUPS, TREND_METRICS, type TrendMetricKey } from "@/server/queries/trends"
import { MetricSheet } from "./MetricSheet"

/** Chart card beside the Averages card from 1280 px. */
export const TRENDS_GRID = "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-4"

export const PERIOD: Record<TrendRange, { label: string; prior: string }> = {
  w: { label: "Last 7 days", prior: "the 7 days before" },
  m: { label: "Last 30 days", prior: "the 30 days before" },
  "6m": { label: "Last 6 months", prior: "the 6 months before" },
  "1y": { label: "Last 12 months", prior: "the year before" },
}

/**
 * The metric picker (spec §7.17): one row naming the section and metric on show; it opens a sheet on a phone and a
 * popover of every section from 768 px (MetricSheet). A choice keeps `?r=`.
 */
export function MetricPicker({ current, r }: { current?: TrendMetricKey; r?: string }) {
  const groups = TREND_GROUPS.map((g) => ({ group: g, metrics: TREND_METRICS.filter((m) => m.group === g).map(({ key, label }) => ({ key, label })) }))
  return <MetricSheet groups={groups} current={current} r={r} />
}
