"use client"

import * as React from "react"
import { Activity, ChevronRight, HeartPulse } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSheetParam } from "@/hooks/use-sheet-param"
import { DAY, formatDay, formatValue } from "@/lib/format"
import type { EcgReading, HeartRhythm as HeartRhythmVM } from "@/server/queries/types"
import { CAPTION, LABEL, StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { CARD_MATERIAL } from "@/components/ui/card"

/** Fitbit's and the reference app's notes both say "not a diagnosis" and name what ECG can't detect (docs/research/heart-rhythm-ui.md). */
export const RHYTHM_DISCLAIMER =
  "Not a diagnosis. ECG and irregular rhythm notifications can’t detect a heart attack, blood clots or stroke. Talk to your doctor about any result."

const ROW = "flex min-h-14 items-center gap-3 px-4 py-2"
const ICON = "size-5 shrink-0 text-muted-foreground"
const PRESS = "outline-none transition-[background-color,scale] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50"
const when = (e: EcgReading) => `${formatDay(e.day, DAY.short)}, ${e.time}`
const bpm = (e: EcgReading) => (e.avgBpm === null ? "--" : formatValue("int", e.avgBpm))

/**
 * Health Monitor's Heart rhythm section: the latest ECG (result, average heart rate, date), older readings as rows,
 * and the irregular rhythm notification count. Each reading opens its sheet (`?ecg=<id>`). With nothing recorded it
 * is one quiet row, so a screen most owners see empty never looks broken.
 */
export function HeartRhythm({ rhythm }: { rhythm: HeartRhythmVM }) {
  const [open, setOpen] = useSheetParam("ecg")
  const [last, setLast] = React.useState<EcgReading | null>(null)
  const current = rhythm.ecg.find((e) => e.id === open)
  const shown = current ?? last
  const select = (e: EcgReading) => {
    setOpen(e.id)
    setLast(e)
  }
  const { ecg, irn } = rhythm

  if (!ecg.length && !irn.count)
    return (
      <div className={cn(CARD_MATERIAL, ROW)}>
        <HeartPulse aria-hidden className={ICON} strokeWidth={1.5} />
        <p className="min-w-0 flex-1">
          <span className="block text-[15px] leading-5 text-foreground-secondary">No heart rhythm readings yet</span>
          <span className={cn(CAPTION, "mt-0.5 block text-pretty")}>ECG readings and irregular rhythm notifications from the Google Health app show up here after they sync.</span>
        </p>
      </div>
    )

  const [latest, ...older] = ecg
  return (
    <div className="space-y-3">
      <div className={cn(CARD_MATERIAL, "overflow-hidden")}>
        {latest ? (
          <button type="button" onClick={() => select(latest)} className={cn(PRESS, "flex w-full flex-col gap-3 p-4 text-left hover:bg-accent active:bg-accent")}>
            <span className="sr-only">{`Latest ECG, ${when(latest)}: ${latest.label}, average ${bpm(latest)} bpm`}</span>
            <span aria-hidden className="flex w-full items-center gap-2.5">
              <Activity className={ICON} strokeWidth={1.5} />
              <span className={cn(LABEL, "flex-1 text-foreground-secondary")}>Latest ECG</span>
              <span className={cn(CAPTION, "tabular-nums")}>{when(latest)}</span>
              <ChevronRight className="-mr-1 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </span>
            <span aria-hidden className="flex flex-col items-start gap-2">
              <ValueUnit
                value={bpm(latest)}
                unit="bpm avg"
                className="font-numeric text-[30px] leading-9 font-bold tracking-[-0.01em]"
                unitClassName="text-sm leading-5 font-medium text-foreground"
              />
              <StatusChip tone={latest.tone}>{latest.label}</StatusChip>
            </span>
          </button>
        ) : (
          <div className={ROW}>
            <Activity aria-hidden className={ICON} strokeWidth={1.5} />
            <p className="flex-1 text-[15px] leading-5 text-foreground-secondary">No ECG readings yet</p>
          </div>
        )}
        {older.length > 0 && (
          // ponytail: every reading listed; page it if someone ever has hundreds.
          <ul aria-label="Earlier ECG readings" className="divide-y divide-border border-t border-border">
            {older.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => select(e)} className={cn(PRESS, ROW, "w-full text-left hover:bg-accent active:bg-accent")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-5 font-medium">{e.label}</span>
                    <span className={cn(CAPTION, "mt-0.5 block tabular-nums")}>{when(e)}</span>
                  </span>
                  <ValueUnit value={bpm(e)} unit="bpm" className="font-numeric text-xl leading-6 font-bold" />
                  <ChevronRight aria-hidden className="-mr-1 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn(CARD_MATERIAL, ROW)}>
        <HeartPulse aria-hidden className={ICON} strokeWidth={1.5} />
        <p className="min-w-0 flex-1">
          <span className={cn(LABEL, "block text-balance")}>Irregular rhythm notifications</span>
          <span className={cn(CAPTION, "mt-0.5 block text-pretty")}>
            {irn.latestDay
              ? `Latest ${formatDay(irn.latestDay, DAY.short)}`
              : "None. The check runs from time to time while you’re still, so no alert doesn’t rule out AFib."}
          </span>
        </p>
        <span className="font-numeric text-xl leading-6 font-bold tabular-nums">{irn.count}</span>
      </div>

      <p className={cn(CAPTION, "px-1 text-pretty")}>{RHYTHM_DISCLAIMER}</p>

      <ResponsiveSheet open={!!current} onOpenChange={(o) => !o && setOpen(null)} title="ECG reading">
        {shown && (
          <div className="space-y-4">
            <div className="space-y-2">
              <ValueUnit value={bpm(shown)} unit="bpm avg" className="block font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]" />
              <StatusChip tone={shown.tone}>{shown.label}</StatusChip>
            </div>
            <p className="text-[15px] leading-[22px] text-pretty text-foreground-secondary tabular-nums">{formatDay(shown.day, DAY.long)} at {shown.time}</p>
            <p className="text-[15px] leading-[22px] text-pretty">{shown.explanation}</p>
            <p className={cn(CAPTION, "text-pretty")}>{RHYTHM_DISCLAIMER}</p>
          </div>
        )}
      </ResponsiveSheet>
    </div>
  )
}
