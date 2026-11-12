import { afterEach, describe, expect, it, vi } from "vitest"
import { closeSheet, openSheet } from "./SheetTrigger"

afterEach(() => window.history.replaceState(null, "", "/strain?d=2026-10-01"))

describe("URL-driven sheets", () => {
  it("open pushes the param over the current screen; close pops that entry", () => {
    window.history.replaceState(null, "", "/strain?d=2026-10-01")
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    openSheet("checkin")
    expect(window.location.pathname + window.location.search).toBe("/strain?d=2026-10-01&checkin=1")
    closeSheet("checkin")
    expect(back).toHaveBeenCalledOnce()
    back.mockRestore()
  })

  it("a sheet that arrived with the URL (a deep link) closes by removing the param in place", () => {
    window.history.replaceState(null, "", "/journal?log=water")
    window.dispatchEvent(new PopStateEvent("popstate")) // forget any entry an earlier open pushed
    const back = vi.spyOn(window.history, "back")
    closeSheet("log")
    expect(back).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
    back.mockRestore()
  })
})
