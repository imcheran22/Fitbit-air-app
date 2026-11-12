"use client"

import * as React from "react"
import Link from "next/link"
import { Check, ChevronDown, ChevronsUpDown } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import type { TrendMetricKey } from "@/server/queries/trends"
import { CARD_LINK } from "@/components/shells/SectionShell"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type MetricGroup = { group: string; metrics: { key: TrendMetricKey; label: string }[] }

/**
 * The metric picker: one row naming the metric on show. On a phone a tap opens a bottom sheet of the sections, the current
 * one open, its metrics as wrapping chips (one section at a time, so the sheet stays about a screen tall). From 768 px it
 * opens a popover with every section side by side, each a short list, so all of them show at once with no scrolling.
 * A tap on a metric switches and closes. Replaces two rows of caps pills (and two sideways-scrolling strips on a phone).
 * `groups` come from the server (parts.tsx): this is a client component and must not import the queries.
 */
export function MetricSheet({ groups, current, r }: { groups: MetricGroup[]; current?: TrendMetricKey; r?: string }) {
  const [open, setOpen] = React.useState(false)
  const shown = groups.flatMap((g) => g.metrics.map((m) => ({ ...m, group: g.group })))
  const metric = shown.find((m) => m.key === current) ?? shown[0]
  const [expanded, setExpanded] = React.useState(metric.group)
  const mobile = useIsMobile()
  const href = (key: TrendMetricKey) => `/trends?metric=${key}${r ? `&r=${r}` : ""}`
  const trigger = (
    <button
      type="button"
      onClick={mobile ? () => (setExpanded(metric.group), setOpen(true)) : undefined}
      aria-haspopup="dialog"
      className={cn(CARD_LINK, "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left md:w-fit md:min-w-72")}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 font-medium text-muted-foreground">{metric.group}</span>
        <span className="block truncate text-[15px] leading-[22px] font-semibold">{metric.label}</span>
      </span>
      <ChevronsUpDown aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </button>
  )
  if (!mobile)
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-[min(calc(100vw-48px),920px)] p-5">
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
            {groups.map(({ group, metrics }) => (
              <section key={group} aria-label={group} className="min-w-0">
                <h3 className="mb-1.5 px-2 text-[13px] leading-4 font-semibold text-muted-foreground">{group}</h3>
                <ul>
                  {metrics.map((m) => {
                    const on = m.key === metric.key
                    return (
                      <li key={m.key}>
                        <Link
                          href={href(m.key)}
                          replace
                          scroll={false}
                          onClick={() => setOpen(false)}
                          aria-current={on ? "page" : undefined}
                          className="flex min-h-9 items-center justify-between gap-2 rounded-lg px-2 text-[14px] leading-5 outline-none transition-colors duration-150 ease-standard hover:bg-foreground/8 focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-foreground/10 aria-[current=page]:font-semibold"
                        >
                          <span className="truncate">{m.label}</span>
                          {on && <Check aria-hidden strokeWidth={2} className="size-4 shrink-0" />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  return (
    <>
      {trigger}
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Metric">
        <ul className="flex flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {groups.map(({ group, metrics }) => {
            const on = group === expanded
            return (
              <li key={group} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setExpanded(group)}
                  className="flex min-h-13 w-full items-center justify-between gap-3 rounded-lg text-left text-[15px] leading-[22px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {group}
                  <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                    {metrics.length}
                    <ChevronDown aria-hidden strokeWidth={1.75} className={cn("size-5 transition-transform duration-200 ease-standard motion-reduce:transition-none", on && "rotate-180")} />
                  </span>
                </button>
                {on && (
                  <div className="flex flex-wrap gap-2 pb-4">
                    {metrics.map((m) => (
                      <Link
                        key={m.key}
                        href={href(m.key)}
                        replace
                        scroll={false}
                        onClick={() => setOpen(false)}
                        aria-current={m.key === metric.key ? "page" : undefined}
                        className="inline-flex h-10 items-center rounded-full bg-muted px-4 text-[14px] leading-5 font-medium text-foreground outline-none transition-[background-color,color,scale] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] aria-[current=page]:bg-foreground aria-[current=page]:text-background"
                      >
                        {m.label}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </ResponsiveSheet>
    </>
  )
}
