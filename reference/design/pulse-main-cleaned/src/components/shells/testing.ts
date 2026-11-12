import * as React from "react"

// Tests only: what Next's router does for URL-driven sheets (SheetTrigger), useSearchParams following
// history.pushState / replaceState and Back.
const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())
for (const m of ["pushState", "replaceState"] as const) {
  const orig = window.history[m].bind(window.history)
  window.history[m] = (...a: Parameters<History["pushState"]>) => {
    orig(...a)
    notify()
  }
}
window.addEventListener("popstate", notify)
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}

/** A `useSearchParams` for `vi.mock("next/navigation")` that reads the live location. */
export function useLocationSearchParams() {
  return new URLSearchParams(React.useSyncExternalStore(subscribe, () => window.location.search))
}
