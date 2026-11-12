"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"
import { DAY, formatDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const MONTHS = Array.from({ length: 12 }, (_, i) => formatDay(`2026-${String(i + 1).padStart(2, "0")}`, { month: "long" }))
const OLDEST = 1920
/** Where the year wheel rests before anything is picked: the middle of the likely range. */
const START_YEAR = 1995
const ROW = 40
const VISIBLE = 3

const pad = (n: number) => String(n).padStart(2, "0")
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

/**
 * One wheel column: a scroll-snap list whose centred row is the value. Scrolling, tapping a row, or the arrow keys
 * (it is a listbox) all pick. `data-vaul-no-drag` keeps a phone drawer from treating the scroll as a swipe.
 */
function Wheel({ label, items, index, onIndex }: { label: string; items: string[]; index: number; onIndex: (i: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  // Follow outside changes (open, a shorter month) without fighting the user's own scroll.
  React.useLayoutEffect(() => {
    const el = ref.current
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW
  }, [index, items.length])
  const go = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i))
    ref.current?.scrollTo({ top: next * ROW, behavior: "smooth" })
    onIndex(next)
  }
  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${id}-${index}`}
      data-vaul-no-drag
      onScroll={(e) => {
        const i = Math.max(0, Math.min(items.length - 1, Math.round(e.currentTarget.scrollTop / ROW)))
        if (i !== index) onIndex(i)
      }}
      onKeyDown={(e) => {
        const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key]
        if (step) {
          e.preventDefault()
          go(index + step)
        }
      }}
      className="relative h-(--wheel) [mask-image:linear-gradient(color-mix(in_srgb,var(--foreground)_35%,transparent),var(--foreground)_45%,var(--foreground)_55%,color-mix(in_srgb,var(--foreground)_35%,transparent))] snap-y snap-mandatory overflow-y-auto overscroll-none rounded-lg py-[calc((var(--wheel)-40px)/2)] outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-foreground/70 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item, i) => (
        <div
          key={item}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === index}
          onClick={() => go(i)}
          className={cn(
            "flex h-10 cursor-pointer snap-center items-center justify-center text-[17px] tabular-nums transition-[color] duration-150 ease-standard select-none",
            i === index ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {item}
        </div>
      ))}
    </div>
  )
}

/**
 * A birth date picker (U19): the field opens three wheels (month, day, year) inline under it, so nothing floats
 * over the form and it works the same inside a sheet. The value posts through a hidden input as yyyy-MM-dd.
 */
export function BirthDatePicker({ id, name, defaultValue, invalid, describedBy }: { id: string; name: string; defaultValue: string; invalid?: boolean; describedBy?: string }) {
  const youngest = React.useMemo(() => new Date().getFullYear() - 13, [])
  const years = React.useMemo(() => Array.from({ length: youngest - OLDEST + 1 }, (_, i) => String(OLDEST + i)), [youngest])
  const [value, setValue] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)
  const field = React.useRef<HTMLButtonElement>(null)
  const [y, m, d] = value ? value.split("-").map(Number) : [START_YEAR, 1, 1]
  const days = Array.from({ length: daysIn(y, m - 1) }, (_, i) => String(i + 1))
  const set = (year: number, month: number, day: number) => setValue(`${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month - 1)))}`)

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <button
        ref={field}
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-wheels`}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-13 w-full min-w-0 items-center justify-between gap-3 rounded-xl bg-field px-4 text-left text-[17px] leading-6 tabular-nums outline-none transition-[box-shadow] duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-foreground/70 data-invalid:ring-2 data-invalid:ring-recovery-red-text",
          open && "ring-2 ring-foreground/70",
          !value && "text-muted-foreground",
        )}
      >
        {value ? formatDay(value, { ...DAY.full, month: "long" }) : "Choose your birth date"}
        <CalendarDays aria-hidden className="size-5 shrink-0 text-foreground-secondary" strokeWidth={1.75} />
      </button>
      {open && (
        <div
          id={`${id}-wheels`}
          role="group"
          aria-label="Birth date"
          style={{ "--wheel": `${ROW * VISIBLE}px` } as React.CSSProperties}
          className="overflow-hidden rounded-xl bg-field motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
        >
          <div className="relative grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-1 px-2 pt-1">
            {/* The selection band behind the centre row. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-2 top-[calc(50%+2px)] h-10 -translate-y-1/2 rounded-lg bg-foreground/8" />
            <Wheel label="Month" items={MONTHS} index={m - 1} onIndex={(i) => set(y, i + 1, d)} />
            <Wheel label="Day" items={days} index={Math.min(d, days.length) - 1} onIndex={(i) => set(y, m, i + 1)} />
            <Wheel label="Year" items={years} index={Math.max(0, years.indexOf(String(y)))} onIndex={(i) => set(OLDEST + i, m, d)} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-foreground/6 py-1.5 pr-1.5 pl-4">
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">Scroll or tap to pick</span>
            <Button
              type="button"
              size="sm"
              className="rounded-full px-5"
              onClick={() => {
                // Done keeps what the wheels show, even if they were never moved.
                set(y, m, d)
                setOpen(false)
                field.current?.focus()
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
