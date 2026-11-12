"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { dayLabel } from "@/lib/format"
import { useClock } from "@/components/shells/ShellStatus"
import { LOG_DAYS, MEALS, RECONNECT, type LogData, type LogKind } from "@/lib/log"
import { cn } from "@/lib/utils"
import { deleteLogEntry } from "@/server/actions/log"
import type { LoggedEntry } from "@/server/log"
import type { LogVM, Weighin } from "@/server/queries/log"
import { CAPTION, LABEL } from "@/components/metrics/primitives"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { openSheet } from "@/components/shells/SheetTrigger"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ICON } from "./Log"

const n = (v: number) => v.toLocaleString("en-US")
const ROW =
  "-mx-2 flex min-h-13 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-[background-color] duration-150 ease-standard hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
const TIME = "shrink-0 font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums"
const MEAL_LABEL = Object.fromEntries(MEALS) as Record<string, string>
const NOT_LISTED = `Total from Google Health. Entries from other apps are listed for the last ${LOG_DAYS} days.`

/** What the entry sheet shows: one entry, or a weigh-in's weight and body fat together. */
type Open = { title: string; kicker: string; entries: LoggedEntry[] }

function Group({ icon: Icon, title, total, kind, vm, children }: { icon: LucideIcon; title: string; total?: string; kind: LogKind; vm: LogVM; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-border py-2 first:border-t-0">
      <div className="flex min-h-11 items-center gap-3">
        <Icon aria-hidden className="size-5 shrink-0 text-foreground-secondary" strokeWidth={1.75} />
        <h3 className={cn(LABEL, "flex-1")}>{title}</h3>
        {total && <span className="font-numeric text-[15px] font-bold tabular-nums">{total}</span>}
        {vm.kinds.includes(kind) && (
          <Button variant="ghost" size="icon-touch" aria-label={`Log ${title.toLowerCase()}`} onClick={() => openSheet("log", kind)} className="-mr-2 text-foreground-secondary hover:text-foreground">
            <Plus aria-hidden strokeWidth={2} />
          </Button>
        )}
      </div>
      <div className="pl-8">{children}</div>
    </section>
  )
}

/** One tappable entry row: title and detail, where it came from, the time. */
function Row({ e, title, detail, time, onOpen }: { e: LoggedEntry; title: string; detail?: string; time: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={ROW} aria-label={`${title}${detail ? `, ${detail}` : ""}, ${time}, ${e.app}`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] leading-[22px]">{title}</span>
        <span className={cn(CAPTION, "truncate")}>{detail ? `${detail} · ${e.app}` : e.app}</span>
      </span>
      <span className={TIME}>{time}</span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </button>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className={cn(CAPTION, "pb-2")}>{children}</p>

/** Journal's day log (spec §11 LG1): the selected day's entries, grouped, each opening a sheet with its details. */
export function DayLog({ vm }: { vm: LogVM }) {
  const router = useRouter()
  const [open, setOpen] = React.useState<Open | null>(null)
  // What the sheet shows: kept while it animates closed, so it never empties mid-way.
  const [shown, setShown] = React.useState<Open | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const formatClock = useClock()
  const time = (ts: number) => formatClock(ts * 1000, vm.timeZone)
  const day = dayLabel(vm.day, vm.today)
  const show = (o: Open) => {
    setConfirming(false)
    setShown(o)
    setOpen(o)
  }

  const remove = async () => {
    if (!open) return
    setRemoving(true)
    let failed: { e: LoggedEntry; error: string } | null = null
    for (const e of open.entries) {
      const r = await deleteLogEntry({ id: e.id }).catch(() => ({ ok: false as const, error: "network" }))
      if (!r.ok) {
        failed = { e, error: r.error }
        break
      }
    }
    setRemoving(false)
    setConfirming(false)
    setOpen(null)
    router.refresh()
    if (!failed) return void toast.success("Deleted")
    const why = failed.error === RECONNECT ? "Reconnect Google in Settings to delete it there." : failed.error === "network" ? "Try again." : failed.error
    // A weigh-in is two points: say which one stayed when the first went.
    toast.error(failed.e === open.entries[0] ? `Couldn’t delete. ${why}` : `${failed.e.title} wasn’t deleted. ${why}`)
  }

  const food = vm.food.total
  const macros = food && food.protein + food.carbs + food.fat > 0 ? food : null
  const weighin = (w: Weighin, last: boolean) => {
    const parts = [w.kg !== null && `${w.kg} kg`, w.pct !== null && `${w.pct}% body fat`].filter(Boolean).join(", ")
    const change = last && vm.body.change ? `${vm.body.change.kg > 0 ? "+" : vm.body.change.kg < 0 ? "−" : "±"}${Math.abs(vm.body.change.kg)} kg since ${dayLabel(vm.body.change.since, vm.today)}` : undefined
    return <Row key={w.ts} e={w.entries[0]} title={parts} detail={change} time={time(w.ts)} onOpen={() => show({ title: "Weigh-in", kicker: `${day}, ${time(w.ts)}`, entries: w.entries })} />
  }

  const sheetEntry = shown?.entries[0]
  const sheetForeign = shown?.entries.some((e) => e.fromApp) ?? false
  const sheetFood = sheetEntry?.type === "nutrition-log" ? (sheetEntry.data as LogData["nutrition-log"]) : null

  return (
    <>
      <Card className="gap-0 px-4 py-1 xl:px-5">
        <Group icon={ICON.water} title="Water" total={vm.water.total ? `${n(vm.water.total)} ml` : undefined} kind="water" vm={vm}>
          {vm.water.entries.length ? (
            <ul aria-label="Drinks" className="flex flex-wrap gap-2 pb-2">
              {vm.water.entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => show({ title: "Water", kicker: `${day}, ${time(e.ts)}`, entries: [e] })}
                    aria-label={`${e.detail}, ${time(e.ts)}, ${e.app}`}
                    className="flex h-11 items-center gap-2 rounded-full border border-border px-3.5 outline-none transition-[background-color] duration-150 ease-standard hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="font-numeric text-[15px] font-bold tabular-nums">{e.detail}</span>
                    <span className={TIME}>{time(e.ts)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{!vm.water.total ? "No drinks logged." : vm.listed ? "Logged in other apps; the drinks show after the next sync." : NOT_LISTED}</Empty>
          )}
        </Group>

        <Group icon={ICON.food} title="Food" total={food ? `${n(food.kcal)} kcal` : undefined} kind="food" vm={vm}>
          {macros && (
            <div className="flex flex-col gap-2 pb-1">
              <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
                <span className="bg-strain" style={{ flexGrow: macros.protein * 4 }} />
                <span className="bg-optimal" style={{ flexGrow: macros.carbs * 4 }} />
                <span className="bg-warning" style={{ flexGrow: macros.fat * 9 }} />
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 font-numeric text-[13px] leading-4 font-semibold text-foreground-secondary tabular-nums">
                <span><span aria-hidden className="mr-1.5 inline-block size-2 rounded-[2px] bg-strain" />Protein {n(macros.protein)} g</span>
                <span><span aria-hidden className="mr-1.5 inline-block size-2 rounded-[2px] bg-optimal" />Carbs {n(macros.carbs)} g</span>
                <span><span aria-hidden className="mr-1.5 inline-block size-2 rounded-[2px] bg-warning" />Fat {n(macros.fat)} g</span>
              </p>
            </div>
          )}
          {food && !vm.listed && vm.food.meals.every((m) => !m.entries.length) && <Empty>{NOT_LISTED}</Empty>}
          {vm.food.meals.map((m) => (
            <div key={m.meal} className="pt-2">
              <div className="flex items-center justify-between">
                <h4 className={cn(LABEL, "text-muted-foreground")}>{m.label}</h4>
                {m.entries.length > 0 && <span className="font-numeric text-[13px] font-semibold text-muted-foreground tabular-nums">{n(m.kcal)} kcal</span>}
              </div>
              {m.entries.length ? (
                m.entries.map((e) => {
                  const f = e.data as LogData["nutrition-log"]
                  const macro = [f.protein != null && `${f.protein} g protein`, f.carbs != null && `${f.carbs} g carbs`, f.fat != null && `${f.fat} g fat`].filter(Boolean).join(", ")
                  return (
                    <Row
                      key={e.id}
                      e={e}
                      title={`${e.title}, ${n(f.kcal)} kcal`}
                      detail={macro || undefined}
                      time={time(e.ts)}
                      onOpen={() => show({ title: e.title, kicker: `${MEAL_LABEL[f.meal] ?? f.meal} · ${day}, ${time(e.ts)}`, entries: [e] })}
                    />
                  )
                })
              ) : (
                <Empty>Nothing logged.</Empty>
              )}
            </div>
          ))}
        </Group>

        <Group icon={ICON.weight} title="Body" kind="weight" vm={vm}>
          {vm.body.weighins.length ? (
            vm.body.weighins.map((w, i) => weighin(w, i === vm.body.weighins.length - 1))
          ) : (
            <Empty>{vm.body.latest ? `No weigh-in. Last: ${vm.body.latest.kg} kg, ${dayLabel(vm.body.latest.day, vm.today)}.` : "No weigh-in."}</Empty>
          )}
        </Group>

        <Group icon={ICON.mood} title="Mood and symptoms" kind="mood" vm={vm}>
          {vm.moods.length + vm.symptoms.length ? (
            [...vm.moods, ...vm.symptoms]
              .sort((a, b) => a.ts - b.ts)
              .map((e) => <Row key={e.id} e={e} title={e.title} detail={e.detail} time={time(e.ts)} onOpen={() => show({ title: e.title, kicker: `${day}, ${time(e.ts)}`, entries: [e] })} />)
          ) : (
            <Empty>Nothing logged.</Empty>
          )}
        </Group>

        {vm.cycle.length > 0 && (
          <Group icon={ICON.period} title="Cycle" kind="period" vm={vm}>
            {vm.cycle.map((e) => {
              const when = e.type === "menstrual-period" ? dayLabel(e.day, vm.today) : time(e.ts)
              return <Row key={e.id} e={e} title={e.title} detail={e.detail} time={when} onOpen={() => show({ title: e.title, kicker: when, entries: [e] })} />
            })}
          </Group>
        )}
      </Card>

      <ResponsiveSheet
        open={open !== null}
        onOpenChange={(o) => !o && !removing && setOpen(null)}
        title={shown?.title ?? ""}
        description={shown?.kicker}
        footer={
          confirming ? (
            <div className="flex flex-col gap-2">
              <p className={cn(CAPTION, "text-center")}>
                {sheetForeign
                  ? "Pulse asks Google Health to delete it. If the app that logged it says no, delete it there."
                  : sheetEntry?.atGoogle
                    ? "It is deleted from Google Health too."
                    : "It is deleted from Pulse."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sheet" onClick={() => setConfirming(false)} disabled={removing}>
                  Keep
                </Button>
                <Button variant="outline" size="sheet" className="text-recovery-red-text" onClick={() => void remove()} disabled={removing}>
                  {removing ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sheet" className="text-recovery-red-text" onClick={() => setConfirming(true)}>
              {shown && shown.entries.length > 1 ? "Delete weigh-in" : "Delete entry"}
            </Button>
          )
        }
      >
        {shown && sheetEntry && (
          <div className="flex flex-col gap-5 pt-2">
            {sheetFood ? (
              <dl className="grid grid-cols-4 gap-2">
                {(
                  [
                    ["kcal", sheetFood.kcal],
                    ["Protein", sheetFood.protein],
                    ["Carbs", sheetFood.carbs],
                    ["Fat", sheetFood.fat],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex flex-col-reverse gap-0.5 rounded-xl bg-muted p-2.5">
                    <dt className="text-xs leading-4 font-semibold text-foreground-secondary">{label}</dt>
                    <dd className="font-numeric text-xl leading-6 font-bold tabular-nums">{v == null ? "--" : label === "kcal" ? n(v) : `${v} g`}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="font-numeric text-2xl leading-8 font-bold tabular-nums">{shown.entries.map((e) => e.detail).join(" · ")}</p>
            )}
            <dl className="flex flex-col border-t border-border">
              <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border">
                <dt className="text-[15px] text-foreground-secondary">Logged in</dt>
                <dd className="text-[15px] font-semibold">{sheetEntry.app}</dd>
              </div>
              <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border">
                <dt className="text-[15px] text-foreground-secondary">In Google Health</dt>
                <dd className="text-[15px] font-semibold">{sheetEntry.atGoogle ? "Yes" : vm.demo ? "No, demo" : "Not yet, in Pulse only"}</dd>
              </div>
            </dl>
            {sheetForeign && <p className={CAPTION}>Logged in another app. To change it, edit it there; Pulse picks up the change on the next sync.</p>}
          </div>
        )}
      </ResponsiveSheet>
    </>
  )
}
