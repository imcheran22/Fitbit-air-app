import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LOG_KINDS, type LogKind } from "@/lib/log"
import type { LogAccess } from "@/server/log"
import type { LogVM } from "@/server/queries/log"
import { Log } from "./Log"

const h = vi.hoisted(() => ({ log: vi.fn<(input: unknown) => Promise<{ ok: true; data: { demo: boolean } }>>(async () => ({ ok: true, data: { demo: true } })) }))
vi.mock("@/server/actions/log", () => ({ logEntry: h.log, deleteLogEntry: vi.fn() }))
vi.mock("next/navigation", async () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: (await import("@/components/shells/testing")).useLocationSearchParams,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const all = (a: LogAccess) => Object.fromEntries(LOG_KINDS.map((k) => [k, a])) as Record<LogKind, LogAccess>
const vm = (o: Partial<LogVM> = {}): LogVM => ({
  kinds: LOG_KINDS.filter((k) => k !== "period" && k !== "ovulation"),
  access: all("demo"),
  day: "2026-10-02",
  today: "2026-10-02",
  timeZone: "Asia/Kolkata",
  listed: true,
  demo: true,
  water: { total: 750, entries: [] },
  food: { total: null, meals: [] },
  body: { latest: { kg: 70.6, day: "2026-09-30" }, change: null, weighins: [] },
  moods: [],
  symptoms: [],
  cycle: [],
  week: [],
  ...o,
})
const tiles = () => within(screen.getByRole("list", { name: "Log" })).getAllByRole("button").map((b) => b.textContent)

beforeEach(() => window.history.replaceState(null, "", "/journal"))

describe("Log", () => {
  it("a male profile gets no cycle tiles; a female one does", () => {
    const { unmount } = render(<Log vm={vm()} />)
    expect(tiles()).toEqual(["750 mlWater", "NoneFood", "70.6 kg · Sep 30Weight", "Mood", "NoneSymptoms"])
    unmount()
    render(<Log vm={vm({ kinds: [...LOG_KINDS] })} />)
    expect(tiles()).toContain("Period")
    expect(tiles()).toContain("Ovulation")
  })

  it("water's quick add saves straight away and says it is demo", async () => {
    render(<Log vm={vm()} />)
    fireEvent.click(screen.getByRole("button", { name: /^Water/ }))
    expect(window.location.search).toBe("?log=water")
    expect(await screen.findByText("Demo: saved in Pulse only")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "+250 ml" }))
    await waitFor(() => expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ kind: "water", ml: 250 })))
  })

  it("logging on a past day defaults the time to that day's noon", async () => {
    render(<Log vm={vm({ day: "2026-09-30" })} />)
    fireEvent.click(screen.getByRole("button", { name: /^Weight/ }))
    expect(await screen.findByLabelText("Time")).toHaveValue("2026-09-30T12:00")
  })

  it("a sheet whose write scope is missing offers Reconnect Google instead of a form", async () => {
    render(<Log vm={vm({ demo: false, access: { ...all("ok"), mood: "reconnect" } })} />)
    fireEvent.click(screen.getByRole("button", { name: "Log mood" }))
    expect(await screen.findByRole("link", { name: "Reconnect Google" })).toHaveAttribute("href", "/oauth/start")
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })
})
