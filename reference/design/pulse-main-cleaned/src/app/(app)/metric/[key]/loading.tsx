import { RANGES } from "@/lib/url"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { SkeletonText } from "@/components/ui/skeleton"
import { METRIC_GRID } from "./sections"

/** Metric detail: the hero's label and value, the History card and its stats with their real labels (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      loading
      title={" "}
      dateSwitcher={{ mode: "day" }}
      hero={
        <div aria-hidden className="flex w-full max-w-[360px] flex-col items-center gap-2 py-4">
          <SkeletonText className="w-16 text-xs leading-4" />
          <SkeletonText className="w-[5ch] font-numeric text-[64px] leading-[64px] font-bold" />
          <SkeletonText className="w-40 text-xs leading-4" />
        </div>
      }
      primary={
        <div aria-hidden className={METRIC_GRID}>
          <SectionShell variant="card" level={2} title="History">
            <TrendChartSkeleton chip ranges={RANGES} />
          </SectionShell>
          <SectionShell variant="card" level={2} title="Last 30 days">
            <div className="divide-y divide-border">
              {["Daily average", "Highest", "Lowest", "Days with data"].map((l) => (
                <KeyStatRowSkeleton key={l} variant="row" label={l} />
              ))}
            </div>
          </SectionShell>
        </div>
      }
    />
  )
}
