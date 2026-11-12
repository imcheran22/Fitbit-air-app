"use client"

import * as React from "react"
import { Search } from "lucide-react"

/**
 * Filters the catalogue in place: a style rule hides every entry (and index link) whose data-kit-name lacks the query,
 * and every group with no match, so the server-rendered page stays as it is. "/" focuses the field.
 */
export function KitSearch() {
  const [q, setQ] = React.useState("")
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== "/" || t?.closest("input, textarea, [contenteditable]")) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const v = q.trim().toLowerCase().replace(/["\\]/g, "")
  const hit = `[data-kit-name*="${v}"]`
  return (
    <>
      <label className="relative block">
        <span className="sr-only">Search components</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <input
          ref={ref}
          type="search"
          name="kit-search"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search"
          className="h-10 w-full rounded-xl border border-border bg-foreground/[0.04] pr-10 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        {!q && (
          <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md border border-border px-1.5 font-numeric text-[11px] leading-5 text-muted-foreground">
            /
          </kbd>
        )}
      </label>
      {v && (
        <style>{`[data-kit-entry]:not(${hit}){display:none}[data-kit-group]:not(:has([data-kit-entry]${hit})){display:none}body:not(:has([data-kit-entry]${hit})) [data-kit-empty]{display:block}`}</style>
      )}
    </>
  )
}
