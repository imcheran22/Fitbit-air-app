import { Archive, BookOpen, CalendarDays, CalendarRange, ChartLine, Database, ListChecks, Palette, Plug, UserRound } from "lucide-react"
import { SCORING_VERSION } from "@/server/pipeline"
import { APP_VERSION } from "@/server/queries/settings"
import { LinkListSkeleton, MORE_COLUMN } from "@/components/shells/LinkList"
import { PageShell } from "@/components/shells/PageShell"
import { About } from "./About"

/** More: the same rows and About card in their final boxes; only the captions are bars (spec §5.19). */
export default function Loading() {
  return (
    <PageShell loading title="More">
      <div className={MORE_COLUMN}>
        <div className="xl:hidden">
          <LinkListSkeleton
            title="Account & settings"
            rows={[
              { icon: UserRound, label: "Account" },
              { icon: Plug, label: "Data source" },
              { icon: Palette, label: "App" },
            ]}
          />
        </div>
        <LinkListSkeleton
          title="Reports"
          rows={[
            { icon: CalendarRange, label: "Weekly report" },
            { icon: CalendarDays, label: "Monthly report" },
            { icon: Archive, label: "All reports" },
          ]}
        />
        <LinkListSkeleton title="Trends" rows={[{ icon: ChartLine, label: "Trends" }]} />
        <LinkListSkeleton title="Journal" rows={[{ icon: ListChecks, label: "Behaviours" }]} />
        <LinkListSkeleton title="Help" rows={[{ icon: BookOpen, label: "How Pulse works" }]} />
        <LinkListSkeleton title="Your data" rows={[{ icon: Database, label: "Export" }]} />
        <div aria-hidden className="contents">
          <About version={APP_VERSION} scoringVersion={SCORING_VERSION} />
        </div>
      </div>
    </PageShell>
  )
}
