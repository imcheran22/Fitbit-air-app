import { ChevronRight } from "lucide-react"
import { DayStripSkeleton } from "@/components/metrics/DayStrip"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/**
 * Journal (spec §7.11, §5.19): strip, then Log, Check-in, the day's log, Insights, This week, History on phone; from 1280 px
 * the first three in the 7fr column and the rest in the 5fr column, as the page lays them out. History shows its week of rows.
 */
export default function Loading() {
  return (
    <PageShell loading title="Journal" dateSwitcher={{ mode: "day" }}>
      <div aria-busy className="-mx-4 md:-mx-1">
        <DayStripSkeleton indicator="journal" />
      </div>
      <div aria-hidden className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-x-6 xl:gap-y-10">
        <div className="flex flex-col gap-8">
        <SectionShell variant="section" title="Log">
          <div className="-mx-4 flex gap-2 overflow-hidden px-4 md:mx-0 md:grid md:grid-flow-col md:auto-cols-fr md:px-0">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-24 shrink-0 rounded-2xl md:w-full" />
            ))}
          </div>
        </SectionShell>
        <SectionShell variant="section" title="Check-in">
          <SectionShell variant="card" title="Check-in">
            <div className="flex flex-col gap-4">
              <span className="block text-[15px] leading-[22px]">
                <SkeletonText className="w-full" />
                <SkeletonText className="w-2/3 xl:hidden" />
              </span>
              <Skeleton className="h-11 rounded-xl" />
            </div>
          </SectionShell>
        </SectionShell>
        <SectionShell variant="section" title="Logged today">
          <Card className="gap-0 px-4 py-1 xl:px-5">
            <ul className="divide-y divide-border">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex min-h-14 items-center gap-3 py-2">
                  <Skeleton className="size-5 rounded-md" />
                  <SkeletonText className="w-24 text-xs leading-4" />
                  <Skeleton className="ml-auto h-4 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          </Card>
        </SectionShell>
        </div>
        <div className="flex flex-col gap-8">
        <SectionShell variant="section" title="Insights"
          action={<span className="text-xs leading-4 font-bold tracking-[0.1em] text-foreground-secondary uppercase">See all</span>}>
          <InsightCardSkeleton action />
        </SectionShell>
        <SectionShell variant="section" title="This week">
          <Skeleton className="h-[25rem] rounded-2xl" />
        </SectionShell>
        <SectionShell variant="section" title="History">
          <Card className="gap-0 px-4 py-1 xl:px-5">
            <ul className="divide-y divide-border">
              {Array.from({ length: 7 }, (_, i) => (
                <li key={i} className="flex min-h-13 items-center gap-3 py-2">
                  <SkeletonText className="w-24 text-xs leading-4" />
                  <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                </li>
              ))}
            </ul>
          </Card>
        </SectionShell>
        </div>
      </div>
    </PageShell>
  )
}
