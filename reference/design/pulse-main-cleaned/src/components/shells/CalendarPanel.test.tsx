import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Dialog } from "@/components/ui/dialog"
import { CalendarPanel } from "./CalendarPanel"
import { ShellStatusProvider } from "./ShellStatus"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/server/actions/calendar", () => ({ loadCalendarMonth: async () => ({ days: [] }) }))

const panel = (selected: string, onSelect = vi.fn()) => {
  render(
    <ShellStatusProvider value={{ mode: "demo", sync: { state: "ok", lastSuccessAt: 1 }, connection: "connected", today: "2026-10-03", firstDay: "2026-04-06" }}>
      <Dialog open>
        <CalendarPanel selected={selected} context="recovery" onSelect={onSelect} />
      </Dialog>
    </ShellStatusProvider>
  )
  return onSelect
}

describe("CalendarPanel Today", () => {
  it("a past day offers Back to today, which selects today, and rings today", () => {
    const onSelect = panel("2026-10-01")
    expect(screen.getByRole("button", { name: /^Today, / })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-10-03")
  })

  it("on today it is hidden until another month is shown", () => {
    panel("2026-10-03")
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
    expect(screen.getByRole("button", { name: "Back to today" })).toBeInTheDocument()
  })
})
