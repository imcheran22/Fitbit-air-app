"use client"

import { createContext, useContext, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TAB_ROOT, dayHref, parentHref } from "@/lib/url"

const NavigationContext = createContext<string | null>(null)
const ROOTS = new Set(Object.values(TAB_ROOT))
// Screens outside the signed-in app: Back never returns to them.
const OUTSIDE = /^\/(login|signup|onboarding|logout|oauth|admin)(\/|$)/

export function AppNavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [root, setRoot] = useState<string | null>(null)
  const day = params.get("d")
  const currentRoot = ROOTS.has(pathname) ? `${pathname}${day ? `?d=${encodeURIComponent(day)}` : ""}` : null
  if (currentRoot && currentRoot !== root) setRoot(currentRoot)

  return <NavigationContext.Provider value={currentRoot ?? root}>{children}</NavigationContext.Provider>
}

/** Where Back goes when this tab has no earlier app screen to return to (a shortcut, a notification, a shared link). */
export function detailBackHref(pathname: string, root: string | null, today: string, day?: string | null, explicit?: string) {
  if (explicit) return explicit
  if (root) return root
  const parent = parentHref(pathname)
  return parent === "/" && day ? dayHref(parent, day, today) : parent
}

export function useAppNavigationRoot() {
  return useContext(NavigationContext)
}

type NavEntry = { url: string | null; index: number }
type NavigationApi = { currentEntry: NavEntry | null; entries(): NavEntry[] }

/**
 * The screen before this one in the tab's history, when it is a screen of this app: Back pops to it, like an app's
 * navigation stack (Strain › Steps › Back is Strain). Uses the Navigation API (Chrome, Safari 26.2+, Firefox 147+);
 * without it, null, and Back falls back to the parent screen. Exported for the test.
 */
export function previousAppEntry(nav = (globalThis as { navigation?: NavigationApi }).navigation): URL | null {
  const at = nav?.currentEntry?.index ?? 0
  const prev = at > 0 ? nav?.entries()[at - 1] : undefined
  if (!prev?.url) return null
  const url = new URL(prev.url)
  return url.origin === location.origin && !OUTSIDE.test(url.pathname) ? url : null
}

/** Back: pop to the previous app screen, else replace this one with `fallback` (so the history doesn't grow). */
export function useAppBack(fallback: string) {
  const router = useRouter()
  return () => (previousAppEntry() ? router.back() : router.replace(fallback))
}

/**
 * Leave a screen that was only a step on the way (Chats, on the way to a chat): pop it when the screen under it is
 * `under`, then replace that one with `href`. So Coach › Chats › a chat › Back returns to where Coach was opened.
 */
export function replaceUnder(router: ReturnType<typeof useRouter>, href: string, under: string, then?: () => void) {
  const go = () => {
    router.replace(href, { scroll: false })
    then?.()
  }
  if (previousAppEntry()?.pathname !== under) return go()
  addEventListener("popstate", () => setTimeout(go), { once: true })
  history.back()
}

/**
 * A tab bar tap. Tabs don't stack on each other: from Home it opens the tab (Back returns Home); from anywhere else
 * it pops when that tab is the screen underneath, else replaces the current screen. Back never walks through tabs.
 */
export function useTabNavigate() {
  const router = useRouter()
  const pathname = usePathname()
  return (href: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || pathname === "/") return // the Link's own push
    e.preventDefault()
    if (href === pathname) return
    if (previousAppEntry()?.pathname === href) router.back()
    else router.replace(href)
  }
}
