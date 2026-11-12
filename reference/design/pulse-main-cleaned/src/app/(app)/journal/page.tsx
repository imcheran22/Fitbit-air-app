import { cookies } from "next/headers"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { DAY, dayLabel, formatDay } from "@/lib/format"
import { FOLDED_COOKIE, parseFolded } from "@/lib/folded"
import { addDays } from "@/server/time"
import { dayHref } from "@/lib/url"
import { getJournal } from "@/server/queries/journal"
import { getLog } from "@/server/queries/log"
import { DayStrip } from "@/components/metrics/DayStrip"
import { InsightCard } from "@/components/metrics/InsightCard"
import { EmptyState } from "@/components/shells/EmptyState"
import { PageShell } from "@/components/shells/PageShell"
import { CollapsibleSection } from "@/components/shells/CollapsibleSection"
import { ActionLink, SectionShell } from "@/components/shells/SectionShell"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { CheckIn, TAG_CLASS } from "./CheckIn"
import { DayLog } from "./DayLog"
import { Log } from "./Log"
import { WeekCard } from "./WeekCard"
import { pageDay, type SearchParams } from "../_lib/day"

export const metadata = { title: "Journal" }

/** History rows before "Show 30 days": a week. The day strip above already reaches every day of the last three weeks. */
const RECENT = 7

/** Journal `/journal?d=` (spec §7.11, journey 7). */
export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const { d, today, ctx } = await pageDay(searchParams as SearchParams, "/journal")
  const allHistory = (await searchParams).history === "all"
  const base = dayHref("/journal", d, today)
  const historyHref = allHistory ? base : `${base}${d === today ? "?" : "&"}history=all`
  const [vm, log] = await Promise.all([getJournal(d, ctx), getLog(d, ctx)])
  const date = formatDay(d, DAY.short)
  const closed = parseFolded((await cookies()).get(FOLDED_COOKIE)?.value)
  const open = (id: string) => !closed.has(id)

  return (
    <PageShell title="Journal" dateSwitcher={{ mode: "day" }}>
      {/* Full-bleed on phone: the strip scrolls edge to edge, its first tile keeps the 16 px gutter inside. From 768 px
          the tiles sit on the column's edges; the 4 px inset only leaves room for the focus ring, which the viewport clips (SYM2). */}
      <div className="-mx-4 md:-mx-1">
        <DayStrip indicator="journal" days={vm.strip.map((s) => ({ date: s.day, done: s.done }))} />
      </div>

      {/* Phone: log tiles, check-in, the day's log, insights, the week, history, top to bottom. From 1280 px the day's work
          takes the wide column and the look back (insights, the week, history) the other, so neither column runs on alone
          (J-02: a 30-row history under the check-in left the right column empty). */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-x-6 xl:gap-y-10">
        {/* Log tiles first: a drink or a weigh-in is a two-tap job; then the check-in, then what the day holds (spec §11 LG1). */}
        <div className="flex flex-col gap-8">
        <SectionShell variant="section" title="Log">
          <Log vm={log} />
        </SectionShell>

        <CollapsibleSection id="check-in" title="Check-in" defaultOpen={open("check-in")}>
          <CheckIn dayLabel={date} checkIn={vm.checkIn} />
        </CollapsibleSection>

        <CollapsibleSection id="logged" title={`Logged ${d === today ? "today" : d === addDays(today, -1) ? "yesterday" : `on ${date}`}`} defaultOpen={open("logged")}>
          <DayLog vm={log} />
        </CollapsibleSection>
        </div>

        <div className="flex flex-col gap-8">
          <CollapsibleSection id="insights" title="Insights" defaultOpen={open("insights")} action={<ActionLink label="See all" href="/journal/insights" />}>
            <InsightCard body={vm.teaser.text} action={vm.teaser.ready ? { label: "See all insights", href: "/journal/insights" } : undefined} />
          </CollapsibleSection>

          <SectionShell variant="section" title="This week">
            <WeekCard week={log.week} day={d} />
          </SectionShell>

          <CollapsibleSection id="history" title="History" defaultOpen={open("history")}>
          {vm.history.length ? (
            <Card className="gap-0 px-4 py-1 xl:px-5">
              <ul>
                {(allHistory ? vm.history : vm.history.slice(0, RECENT)).map((h, i) => {
                  const shown = h.yes.slice(0, 2) // the narrow column fits two tags beside the date
                  const more = h.yes.length - shown.length
                  return (
                    <li key={h.day} className={cn(i > 0 && "border-t border-border")}>
                      <Link
                        href={dayHref("/journal", h.day, today)}
                        aria-current={h.day === d ? "date" : undefined}
                        aria-label={`${dayLabel(h.day, today)}: ${h.yes.length ? h.yes.join(", ") : "no behaviours"}`}
                        className="relative -mx-2 flex min-h-13 items-center gap-3 rounded-lg px-2 py-2 transition-[background-color] duration-150 ease-standard outline-none before:absolute before:inset-y-3.5 before:left-0 before:w-[3px] before:rounded-full before:bg-foreground before:opacity-0 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent aria-[current=date]:before:opacity-100"
                      >
                        <span className="w-28 shrink-0 text-xs leading-4 font-bold tracking-[0.1em] uppercase tabular-nums">{dayLabel(h.day, today)}</span>
                        <span aria-hidden className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                          {shown.map((y) => (
                            <Badge key={y} variant="secondary" className={TAG_CLASS}>
                              {y}
                            </Badge>
                          ))}
                          {more > 0 && <span className="self-center font-numeric text-[13px] font-semibold text-muted-foreground tabular-nums">+{more}</span>}
                          {!h.yes.length && <span className="self-center text-xs leading-4 font-medium text-muted-foreground">No behaviours</span>}
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {vm.history.length > RECENT && (
                <Link
                  href={historyHref}
                  scroll={false}
                  className="-mx-2 mb-1 grid h-11 place-items-center rounded-lg border-t border-border text-xs font-bold tracking-[0.1em] text-foreground/85 uppercase outline-none transition-[background-color,color] duration-150 ease-standard hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {allHistory ? "Show last week" : "Show 30 days"}
                </Link>
              )}
            </Card>
          ) : (
            <EmptyState
              body="No check-ins yet. Your first one takes under a minute."
              action={{ label: "Check in", sheet: "checkin" }}
            />
          )}
          </CollapsibleSection>
        </div>
      </div>
    </PageShell>
  )
}
