import { IntradayHrChartSkeleton } from "@/components/charts/IntradayHrChart"
import { ZoneBarsSkeleton } from "@/components/charts/ZoneBars"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { SkeletonText } from "@/components/ui/skeleton"

const LABEL = "text-xs leading-4 font-bold tracking-[0.1em] uppercase"

/** Heart rate loading: the date row, the reading with its three stats, the day's chart, then time in zones. */
export default function Loading() {
  return (
    <DetailShell
      loading
      title="Heart rate"
      dateSwitcher={{ mode: "day" }}
      hero={
        <div aria-hidden className="flex w-full max-w-[360px] flex-col items-center gap-2 py-4 text-center">
          <SkeletonText className="w-[3ch] font-numeric text-[64px] leading-[64px] font-bold" />
          <SkeletonText className="w-28 text-xs leading-4" />
          <ul className="mt-4 grid w-full grid-cols-3 gap-3">
            {["Range", "Average", "Resting"].map((w) => (
              <li key={w}>
                <SkeletonText className="mx-auto w-[4ch] font-numeric text-xl leading-6 font-bold" />
                <p className={`${LABEL} mt-1 text-muted-foreground`}>{w}</p>
              </li>
            ))}
          </ul>
        </div>
      }
      primary={
        <SectionShell variant="card" level={2} title="Today">
          <IntradayHrChartSkeleton />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="zones" variant="card" level={2} title="Time in zones" className="xl:col-span-2">
          <ZoneBarsSkeleton variant="rows" />
        </SectionShell>,
      ]}
    />
  )
}
