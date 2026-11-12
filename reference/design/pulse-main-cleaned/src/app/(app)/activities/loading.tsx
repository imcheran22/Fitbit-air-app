import { TimelineSkeleton } from "@/components/metrics/ActivityCard"
import { DetailShell } from "@/components/shells/DetailShell"
import { GROUP_LABEL, MORE_COLUMN } from "@/components/shells/LinkList"
import { CARD_MATERIAL } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Activities: the summary card and two day groups at their final size (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      loading
      title="Activities"
      primary={
        <div className={MORE_COLUMN}>
          <div className="space-y-2">
            <p className={GROUP_LABEL}>Last 30 days</p>
            <div className={cn(CARD_MATERIAL, "h-[92px]")} />
          </div>
          {[1, 2].map((n) => (
            <div key={n} className="space-y-2">
              <p className={GROUP_LABEL}>&nbsp;</p>
              <div className={cn(CARD_MATERIAL, "p-1.5")}>
                <TimelineSkeleton rows={n} />
              </div>
            </div>
          ))}
        </div>
      }
    />
  )
}
