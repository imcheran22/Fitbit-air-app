import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppNavigationProvider, detailBackHref, previousAppEntry, replaceUnder } from "./AppNavigation"
import { DetailHeaderRow } from "./DetailHeader"

const route = vi.hoisted(() => ({ pathname: "/", search: "" }))
const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => router,
}))
vi.mock("next/link", () => ({ default: ({ replace, children, ...props }: React.ComponentProps<"a"> & { replace?: boolean }) => <a {...props} data-replace={replace}>{children}</a> }))
vi.mock("./ShellStatus", () => ({ useShellCalendar: () => ({ today: "2026-10-07" }) }))

const today = "2026-10-07"
/** A tab's history as the Navigation API reports it, standing on the last entry. */
const historyOf = (...paths: string[]) => {
  const entries = paths.map((p, index) => ({ url: `${location.origin}${p}`, index }))
  return { currentEntry: entries.at(-1)!, entries: () => entries }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("Back pops the app's own history", () => {
  it("finds the previous app screen, never one outside the app", () => {
    expect(previousAppEntry(historyOf("/", "/strain", "/metric/steps"))?.pathname).toBe("/strain")
    expect(previousAppEntry(historyOf("/strain?d=2026-10-01", "/metric/steps"))?.search).toBe("?d=2026-10-01")
    expect(previousAppEntry(historyOf("/login", "/"))).toBeNull()
    expect(previousAppEntry(historyOf("/recovery"))).toBeNull() // opened from a shortcut or a notification
    expect(previousAppEntry(undefined)).toBeNull() // no Navigation API
  })

  it("Strain › Steps › Back returns to Strain, not Home", () => {
    vi.stubGlobal("navigation", historyOf("/", "/strain", "/metric/steps"))
    route.pathname = "/metric/steps"
    route.search = ""
    render(<AppNavigationProvider><DetailHeaderRow title="Steps" /></AppNavigationProvider>)
    fireEvent.click(screen.getByRole("link", { name: "Back" }))
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("with nothing to return to, replaces the screen with its parent", () => {
    vi.stubGlobal("navigation", historyOf("/health/stress"))
    route.pathname = "/health/stress"
    render(<AppNavigationProvider><DetailHeaderRow title="Stress" /></AppNavigationProvider>)
    const back = screen.getByRole("link", { name: "Back" })
    expect(back.getAttribute("href")).toBe("/health")
    fireEvent.click(back)
    expect(router.replace).toHaveBeenCalledWith("/health")
    expect(router.back).not.toHaveBeenCalled()
  })

  it("opening a chat from Chats pops Chats first, so Back from the chat skips the list", () => {
    vi.stubGlobal("navigation", historyOf("/health", "/coach", "/coach/chats"))
    const back = vi.spyOn(history, "back").mockImplementation(() => {})
    vi.useFakeTimers()
    replaceUnder(router as never, "/coach?c=saved", "/coach")
    expect(back).toHaveBeenCalledOnce()
    dispatchEvent(new PopStateEvent("popstate"))
    vi.runAllTimers()
    vi.useRealTimers()
    expect(router.replace).toHaveBeenCalledWith("/coach?c=saved", { scroll: false })

    // Chats opened directly: nothing to pop.
    vi.stubGlobal("navigation", historyOf("/coach/chats"))
    replaceUnder(router as never, "/coach?c=other", "/coach")
    expect(back).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenLastCalledWith("/coach?c=other", { scroll: false })
  })
})

describe("the fallback parent", () => {
  it("honors explicit nested destinations and gives direct links a parent", () => {
    expect(detailBackHref("/coach/chats", "/more", today, null, "/coach")).toBe("/coach")
    expect(detailBackHref("/activity/123", "/", today, null, "/strain?d=2026-10-01")).toBe("/strain?d=2026-10-01")
    for (const [path, parent] of [["/health/stress", "/health"], ["/journal/insights", "/journal"], ["/reports/week", "/more"], ["/settings", "/more"], ["/coach", "/"]]) {
      expect(detailBackHref(path, null, today)).toBe(parent)
    }
    expect(detailBackHref("/metric/hrv", null, today, "2026-10-01")).toBe("/?d=2026-10-01")
  })
})
