"use client"

import * as React from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

/** Old names some browsers still report (ICU keeps them canonical), mapped to today's names. */
const RENAMED: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Enderbury": "Pacific/Kanton",
  "America/Godthab": "America/Nuuk",
}
/** Today's name for a zone. */
export const canonicalZone = (id: string) => RENAMED[id] ?? id

type Zone = { id: string; city: string; region: string; offset: string; minutes: number; search: string }

/** "GMT+5:30" and its minutes east of UTC, for one zone right now. */
function offsetOf(id: string): { offset: string; minutes: number } {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")
  const offset = part?.value === "GMT" ? "GMT+0" : (part?.value ?? "GMT+0")
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(offset)
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
  return { offset, minutes }
}

let cached: Zone[] | undefined
/** Every zone the browser knows, by offset then city. Built once, on first open. */
function zones(): Zone[] {
  if (cached) return cached
  const ids = [...new Set((typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []).map(canonicalZone))]
  cached = ids
    .map((id) => {
      const parts = id.split("/")
      const city = parts.at(-1)!.replaceAll("_", " ")
      const region = parts.length > 1 ? parts.slice(0, -1).join(" / ").replaceAll("_", " ") : "Other"
      const o = offsetOf(id)
      return { id, city, region, ...o, search: `${city} ${region} ${id} ${o.offset}`.toLowerCase() }
    })
    .sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city))
  return cached
}

/** "Kolkata, Asia (GMT+5:30)" for a zone id. */
export const describeZone = (id: string) => {
  const z = zones().find((x) => x.id === canonicalZone(id))
  return z ? `${z.city}, ${z.region} (${z.offset})` : id
}

const MAX_SHOWN = 80
/** One option row, px (h-12); the list snaps to whole rows. */
const ZONE_ROW = 48

/**
 * A searchable time zone picker (ARIA combobox): type a city, region or offset, pick with the arrow keys and
 * Enter, or tap. The list opens in the flow under the field, so a sheet's scroll area never clips it. The chosen
 * zone id is submitted through a hidden input named `name`.
 */
export function TimeZoneCombobox({
  id,
  name,
  value,
  onChange,
  className,
  ...aria
}: {
  id: string
  name: string
  value: string
  onChange: (zone: string) => void
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const listId = `${id}-list`
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const input = React.useRef<HTMLInputElement>(null)
  const list = React.useRef<HTMLUListElement>(null)

  const matches = React.useMemo(() => {
    if (!open) return []
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const all = zones()
    const hit = words.length ? all.filter((z) => words.every((w) => z.search.includes(w))) : all
    // Unfiltered, every zone, so the list can open on the chosen one wherever it sorts.
    return words.length ? hit.slice(0, MAX_SHOWN) : hit
  }, [open, query])

  const show = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) {
      const at = zones().findIndex((z) => z.id === canonicalZone(value))
      setActive(Math.max(0, at))
    }
  }
  const pick = (z: Zone) => {
    onChange(z.id)
    setOpen(false)
    setQuery("")
    input.current?.focus()
  }

  // Opening puts the chosen zone in the list's middle row (of three), whole rows only; arrowing then keeps the active one in view.
  React.useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = Math.max(0, active - 1) * ZONE_ROW
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open])
  React.useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) return show(true)
      const step = e.key === "ArrowDown" ? 1 : -1
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0))
    } else if (e.key === "Enter" && open) {
      e.preventDefault()
      if (matches[active]) pick(matches[active])
    } else if (e.key === "Escape" && open) {
      e.preventDefault()
      show(false)
    } else if (e.key === "Tab") {
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-opt-${matches[active].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={open || !value ? "Search city or GMT offset" : describeZone(value)}
          value={open ? query : value ? describeZone(value) : ""}
          onFocus={() => !open && show(true)}
          onClick={() => !open && show(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            if (!open) setOpen(true)
          }}
          onBlur={(e) => {
            // Leaving for anything outside the list closes it; a tap on an option keeps focus (onMouseDown below).
            if (!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
          onKeyDown={onKeyDown}
          className={cn(className, "truncate pr-12 pl-11")}
          {...aria}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close time zones" : "Show time zones"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            show(!open)
            input.current?.focus()
          }}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted-foreground transition-[color] duration-150 ease-standard hover:text-foreground"
        >
          <ChevronDown aria-hidden className={cn("size-5 transition-transform duration-200 ease-standard motion-reduce:transition-none", open && "rotate-180")} strokeWidth={1.75} />
        </button>
      </div>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Time zones"
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-[152px] snap-y scroll-pt-1 overflow-y-auto overscroll-none rounded-xl bg-field p-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
        >
          {matches.length === 0 && <li className="px-3 py-3 text-[15px] leading-5 text-muted-foreground">No time zone matches “{query}”.</li>}
          {matches.map((z, i) => {
            const selected = z.id === canonicalZone(value)
            return (
              <li
                key={z.id}
                id={`${id}-opt-${z.id}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(z)}
                className={cn(
                  "flex h-12 cursor-pointer snap-start items-center gap-3 rounded-lg px-3 transition-[background-color] duration-100",
                  i === active ? "bg-foreground/8" : "bg-transparent",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[15px] leading-5">
                  <span className={cn("text-foreground", selected ? "font-semibold" : "font-medium")}>{z.city}</span>
                  <span className="text-muted-foreground"> · {z.region}</span>
                </span>
                <span className="shrink-0 font-numeric text-[13px] leading-[18px] text-foreground-secondary tabular-nums">{z.offset}</span>
                <Check aria-hidden className={cn("size-4 shrink-0 text-foreground", selected ? "opacity-100" : "opacity-0")} strokeWidth={2.25} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
