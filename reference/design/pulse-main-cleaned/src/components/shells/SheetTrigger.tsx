"use client"

import * as React from "react"

/*
 * Task sheets (check-in, log) open over the screen you are on through a search param (`?checkin=1`, `?log=water`),
 * spec §11 UX2. Opening pushes a history entry rather than navigating: Next syncs useSearchParams without
 * refetching the page, so the screen and its scroll stay put, and the Back button or gesture pops the entry and
 * closes the sheet instead of leaving the screen.
 */

/** The param this tab pushed, so closing pops that entry; a sheet that arrived with the URL (a deep link) replaces. */
let pushed: string | null = null

export function openSheet(key: string, value = "1") {
  const url = new URL(window.location.href)
  if (url.searchParams.get(key) === value) return
  url.searchParams.set(key, value)
  window.history.pushState(null, "", url)
  pushed = key
  // Any traversal leaves the pushed entry (Back, or our own back() on close).
  window.addEventListener("popstate", () => (pushed = null), { once: true })
}

export function closeSheet(key: string) {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(key)) return
  if (pushed === key) return window.history.back()
  url.searchParams.delete(key)
  window.history.replaceState(null, "", url)
}

/** A button that opens a URL-driven sheet over the current screen. */
export function SheetTrigger({ sheet, onClick, ...props }: Omit<React.ComponentProps<"button">, "type"> & { sheet: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-sheet={sheet}
      {...props}
      onClick={(e) => {
        onClick?.(e)
        openSheet(sheet)
      }}
    />
  )
}
