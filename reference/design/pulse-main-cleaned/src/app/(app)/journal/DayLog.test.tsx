import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LOG_KINDS, type LogKind } from "@/lib/log"
import type { LoggedEntry } from "@/server/log"
import type { LogVM } from "@/server/queries/log"
import { DayLog } from "./DayLog"

const h = vi.hoisted(() => ({ del: vi.fn<(input: unknown) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })) }))
vi.mock("@/server/actions/log", () => ({ logEntry: vi.fn(), deleteLogEntry: h.del }))
vi.mock("next/navigation", async () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: (await import("@/components/shells/testing")).useLocationSearchParams,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const T = Date.parse("2026-10-02T07:22:00+05:30") / 1000
const e = (id: string, type: LoggedEntry["type"], title: string, detail: string, data: unknown, o: Partial<LoggedEntry> = {}): LoggedEntry => ({
  id,
  type,
  ts: T,
  day: "2026-10-02",
  title,
  detail,
  data,
  atGoogle: true,
  fromApp: false,
  app: "Pulse",
  createdAt: T,
  ...o,
})
const vm = (o: Partial<LogVM> = {}): LogVM => ({
  kinds: LOG_KINDS.filter((k) => k !== "period" && k !== "ovulation") as LogKind[],
  access: Object.fromEntries(LOG_KINDS.map((k) => [k, "ok"])) as LogVM["access"],
  day: "2026-10-02",
  today: "2026-10-02",
  timeZone: "Asia/Kolkata",
  listed: true,
  demo: false,
  water: { total: 750, entries: [e("w1", "hydration-log", "Water", "250 ml", { ml: 250 }), e("w2", "hydration-log", "Water", "500 ml", { ml: 500 }, { app: "Fitbit", fromApp: true })] },
  food: {
    total: { kcal: 320, protein: 8, carbs: 58, fat: 7 },
    meals: [
      { meal: "BREAKFAST", label: "Breakfast", kcal: 320, entries: [e("f1", "nutrition-log", "Poha", "320 kcal", { name: "Poha", meal: "BREAKFAST", kcal: 320, protein: 8, carbs: 58, fat: 7 }, { app: "Fitbit", fromApp: true })] },
      { meal: "LUNCH", label: "Lunch", kcal: 0, entries: [] },
    ],
  },
  body: {
    latest: { kg: 70.6, day: "2026-10-02" },
    change: { kg: -0.4, since: "2026-09-28" },
    weighins: [{ ts: T, kg: 70.6, pct: 23.5, entries: [e("kg", "weight", "Weight", "70.6 kg", { kg: 70.6 }), e("bf", "body-fat", "Body fat", "23.5%", { pct: 23.5 })] }],
  },
  moods: [],
  symptoms: [],
  cycle: [],
  week: [],
  ...o,
})

beforeEach(() => {
  window.history.replaceState(null, "", "/journal")
  h.del.mockClear()
})

describe("DayLog", () => {
  it("shows drinks as chips, food under its meal, one row per weigh-in and empty groups as such", () => {
    render(<DayLog vm={vm()} />)
    expect(within(screen.getByRole("list", { name: "Drinks" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "250 ml, 07:22, Pulse",
      "500 ml, 07:22, Fitbit",
    ])
    const food = screen.getByRole("region", { name: "Food" })
    expect(within(food).getByRole("button", { name: /^Poha, 320 kcal, 8 g protein/ })).toBeInTheDocument()
    expect(within(food).getByText("Nothing logged.")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Body" })).getByRole("button", { name: /^70.6 kg, 23.5% body fat, −0.4 kg since/ })).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Mood and symptoms" })).getByText("Nothing logged.")).toBeInTheDocument()
  })

  it("an entry opens its sheet with where it was logged; another app's entry says to edit it there", async () => {
    render(<DayLog vm={vm()} />)
    fireEvent.click(screen.getByRole("button", { name: /^Poha/ }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByText("Fitbit")).toBeInTheDocument()
    expect(within(sheet).getByText(/edit it there/)).toBeInTheDocument()
  })

  it("deleting a weigh-in asks first, then deletes its weight and body fat", async () => {
    render(<DayLog vm={vm()} />)
    fireEvent.click(screen.getByRole("button", { name: /^70.6 kg/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete weigh-in" }))
    expect(h.del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(h.del.mock.calls.map((c) => c[0])).toEqual([{ id: "kg" }, { id: "bf" }]))
  })

  it("a weigh-in whose body fat fails to delete says so, and still refreshes", async () => {
    const { toast } = await import("sonner")
    h.del.mockImplementationOnce(async () => ({ ok: true, data: undefined })).mockImplementationOnce(async () => ({ ok: false, error: "This was logged in another app. Delete it there." }) as never)
    render(<DayLog vm={vm()} />)
    fireEvent.click(screen.getByRole("button", { name: /^70.6 kg/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete weigh-in" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Body fat wasn’t deleted. This was logged in another app. Delete it there."))
  })

  it("past the import window, a total without entries says why", () => {
    render(<DayLog vm={vm({ listed: false, water: { total: 1100, entries: [] } })} />)
    expect(within(screen.getByRole("region", { name: "Water" })).getByText(/listed for the last 14 days/)).toBeInTheDocument()
  })

  it("a group's plus opens that log sheet", () => {
    render(<DayLog vm={vm()} />)
    fireEvent.click(screen.getByRole("button", { name: "Log water" }))
    expect(window.location.search).toBe("?log=water")
  })
})
