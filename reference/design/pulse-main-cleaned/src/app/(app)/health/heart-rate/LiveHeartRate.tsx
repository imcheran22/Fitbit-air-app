"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ago, MISSING } from "@/lib/format"
import { useNow } from "@/hooks/use-now"
import type { HeartRateLive, HeartRateVM } from "@/server/queries/types"
import { IntradayHrChart } from "@/components/charts/IntradayHrChart"
import { CAPTION, LABEL, ValueUnit } from "@/components/metrics/primitives"

const POLL_MS = 60_000
const MAX_BACKOFF_MS = 10 * 60_000
/** A reading this recent counts as live: the band, the phone and Google's cloud take a minute or three between them. */
const LIVE_MS = 5 * 60_000

type View = Pick<HeartRateVM, "isToday" | "end" | "restingHr" | "zoneBands" | "maxHr"> & HeartRateLive
const Ctx = React.createContext<View | null>(null)
const useView = () => React.useContext(Ctx)!

/**
 * Holds the day's minutes and, while today is on screen and the tab is visible, polls `/heart-rate` every minute
 * (the server pulls from Google at most once a minute per user) and merges what comes back. Hidden tab: no
 * requests until it shows again. A failed poll doubles the wait, up to 10 minutes.
 */
export function LiveHeartRate({ vm, children }: { vm: View; children: React.ReactNode }) {
  const [live, setLive] = React.useState<HeartRateLive>({ points: vm.points, latest: vm.latest })
  const sinceRef = React.useRef(vm.latest?.t ?? vm.points[0]?.t ?? 0)
  const { isToday, end } = vm

  React.useEffect(() => {
    if (!isToday) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let ctrl: AbortController | undefined
    let wait = POLL_MS
    const stop = () => {
      clearTimeout(timer)
      ctrl?.abort()
    }
    const poll = async () => {
      stop()
      if (document.hidden || Date.now() >= end) return // the day is over: past days don't poll
      ctrl = new AbortController()
      try {
        const since = sinceRef.current
        const res = await fetch(`/heart-rate?since=${since}`, { cache: "no-store", signal: ctrl.signal })
        if (!res.ok) throw new Error(String(res.status))
        const next = (await res.json()) as HeartRateLive
        const from = Math.floor(since / 60_000) * 60_000
        if (next.latest) sinceRef.current = next.latest.t
        setLive((prev) => ({
          points: [...prev.points.filter((p) => p.t < from), ...next.points.filter((p) => p.t >= from && p.t < end)],
          latest: next.latest ?? prev.latest,
        }))
        wait = POLL_MS
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
        wait = Math.min(wait * 2, MAX_BACKOFF_MS)
      }
      timer = setTimeout(poll, wait)
    }
    const onVisibility = () => (document.hidden ? stop() : void poll())
    document.addEventListener("visibilitychange", onVisibility)
    void poll()
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      stop()
    }
  }, [isToday, end])

  const view = React.useMemo(() => ({ ...vm, ...live }), [vm, live])
  return <Ctx.Provider value={view}>{children}</Ctx.Provider>
}

/** "● 2 minutes ago": the dot pulses while the reading is under 5 minutes old. Renders after hydration (useNow). */
export function LastReading({ t, className }: { t: number; className?: string }) {
  const now = useNow()
  if (now === null) return <span className={cn(CAPTION, "invisible", className)}>{MISSING}</span>
  const fresh = now - t < LIVE_MS
  return (
    <span className={cn(CAPTION, "inline-flex items-center gap-1.5 tabular-nums", className)}>
      {fresh && (
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inset-0 rounded-full bg-strain opacity-40 motion-safe:animate-ping motion-safe:[animation-duration:2s]" />
          <span className="relative size-2 rounded-full bg-strain" />
        </span>
      )}
      {fresh && <span className="sr-only">Live, </span>}
      {ago(t, now)}
    </span>
  )
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** The latest reading (today) or the day's average (a past day), over the day's range, average and resting HR. */
export function HeartRateHero() {
  const v = useView()
  const bpms = v.points.flatMap((p) => (p.v === null ? [] : [p.v]))
  const avg = bpms.length ? Math.round(mean(bpms)) : null
  const big = v.isToday ? (v.latest?.bpm ?? null) : avg
  const stats = [
    { label: "Range", value: bpms.length ? `${Math.min(...bpms)}–${Math.max(...bpms)}` : MISSING, spoken: bpms.length ? `${Math.min(...bpms)} to ${Math.max(...bpms)}` : "no readings" },
    ...(v.isToday ? [{ label: "Average", value: avg === null ? MISSING : String(avg), spoken: avg === null ? "no readings" : String(avg) }] : []),
    { label: "Resting", value: v.restingHr === null ? MISSING : String(v.restingHr), spoken: v.restingHr === null ? "not yet" : String(v.restingHr) },
  ]
  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-2 py-4 text-center">
      <ValueUnit
        value={big === null ? MISSING : String(big)}
        unit="bpm"
        className="font-numeric text-[64px] leading-[64px] font-bold tracking-[-0.02em]"
        unitClassName="text-xl leading-7 font-semibold text-foreground-secondary"
      />
      {v.isToday ? (
        v.latest ? <LastReading t={v.latest.t} /> : <p className={CAPTION}>No readings yet today</p>
      ) : (
        <p className={CAPTION}>{avg === null ? "No readings on this day" : "Day average"}</p>
      )}
      <ul className={cn("mt-4 grid w-full gap-3", stats.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {stats.map((s) => (
          <li key={s.label} aria-label={`${s.label}: ${s.spoken}${s.spoken.match(/\d/) ? " beats per minute" : ""}`}>
            <p aria-hidden className="font-numeric text-xl leading-6 font-bold tabular-nums">
              {s.value}
            </p>
            <p aria-hidden className={cn(LABEL, "mt-1 text-muted-foreground")}>
              {s.label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The day's minute chart: a minute without a reading is a gap, never a line across it. */
export function HeartRateChart() {
  const v = useView()
  const data = {
    value: {
      points: v.points.map((p) => ({ t: p.t, bpm: p.v })),
      zones: v.zoneBands.map((z) => ({ zone: z.zone, label: z.label, min: z.min, max: z.max ?? v.maxHr })),
      now: v.isToday && v.latest ? v.latest.t : undefined,
    },
    reason: null,
    provisional: false,
  }
  return <IntradayHrChart data={data} />
}
