"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "@/hooks/use-theme"

/**
 * Keeps the browser bar on the ground's top colour: the `--theme-color` token, which follows the theme and the page's
 * ground (Healthspan's is darker). Server metadata gives the first paint; this follows a theme or route change.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme()
  const pathname = usePathname()
  React.useEffect(() => {
    // After paint, so the route's data-ground and the theme class are in the DOM.
    const id = requestAnimationFrame(() => {
      const color = getComputedStyle(document.documentElement).getPropertyValue("--theme-color").trim()
      if (!color) return
      // Next renders these tags (one per scheme) and owns them: change only their colour, never remove one, so
      // whichever media query matches shows the theme actually chosen.
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = color))
    })
    return () => cancelAnimationFrame(id)
  }, [resolvedTheme, pathname])
  return null
}
