import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { Card } from "@/components/ui/card"
import { VitalTilesSkeleton } from "./VitalTiles"
import { STAT_ICON } from "../../_lib/view"

/**
 * Health Monitor loading (spec §7.8, §5.19): the date row, the count hero, the five vital tiles with the note, then
 * Heart rhythm at its one-row size and the two measurements every owner has.
 */
export default function Loading() {
  return (
    <DetailShell loading
      title="Health Monitor"
      dateSwitcher={{ mode: "day" }}
      hero={
        <div aria-hidden className="flex flex-col items-center gap-3 py-4 text-center">
          <SkeletonText className="w-[2.5ch] font-numeric text-[64px] leading-none font-bold md:text-[72px]" />
          <p className="text-xs leading-4 font-bold tracking-[0.1em] uppercase">Metrics within range</p>
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      }
      primary={
        <SectionShell variant="section" title="Last night’s readings">
          <VitalTilesSkeleton />
        </SectionShell>
      }
      footer={
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2 xl:gap-6">
          <SectionShell variant="section" title="Heart rhythm">
            <Skeleton className="h-14 w-full rounded-2xl" />
          </SectionShell>
          <SectionShell variant="section" title="Measurements">
            <Card className="gap-0 px-4 py-1 ring-0">
              <div className="divide-y divide-border">
                <KeyStatRowSkeleton variant="row" label="Weight" icon={STAT_ICON.weight} />
                <KeyStatRowSkeleton variant="row" label="Body fat" icon={STAT_ICON.body_fat} />
              </div>
            </Card>
          </SectionShell>
        </div>
      }
    />
  )
}
