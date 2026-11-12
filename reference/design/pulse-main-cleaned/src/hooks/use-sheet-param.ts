"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { withParam } from "@/lib/url"

/**
 * A detail sheet's open item kept in the URL (`?vital=hrv`), so the sheet deep-links and Back closes it. Opening
 * pushes a history entry with the native History API, which Next syncs into useSearchParams without a server round
 * trip; closing steps back over that entry, or drops the param in place when the sheet was opened by a link.
 */
export function useSheetParam(key: string): [string | null, (next: string | null) => void] {
  const value = useSearchParams().get(key)
  const pushed = React.useRef(false)
  const set = React.useCallback(
    (next: string | null) => {
      const { pathname, search, hash } = window.location
      const url = `${pathname}${withParam(search, key, next)}${hash}`
      if (next !== null && value === null) {
        window.history.pushState(null, "", url)
        pushed.current = true
      } else if (next === null && value !== null && pushed.current) {
        pushed.current = false
        window.history.back()
      } else if (next !== value) {
        window.history.replaceState(null, "", url)
      }
    },
    [key, value]
  )
  return [value, set]
}
