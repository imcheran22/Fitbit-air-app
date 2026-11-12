import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Vital, VitalKey } from "@/server/queries/types"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { VitalTiles } from "./VitalTiles"

const keys: VitalKey[] = ["resp", "spo2", "restingHr", "hrv", "skinTempDev"]
const vitals = keys.map((key): Vital => ({
  key, label: key, short: key, unit: "", metric: { value: null, reason: "no_data", provisional: false },
  range: null, status: "no_data", chip: null, trend: { points: [], baseline: null },
}))

describe("metric destinations", () => {
  it("opens each Health Monitor vital's full detail even without a reading, preserving the selected day", () => {
    render(<VitalTiles vitals={vitals} day="2026-10-03" today="2026-10-07" />)
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      "/metric/resp?d=2026-10-03", "/metric/spo2?d=2026-10-03", "/metric/rhr?d=2026-10-03", "/metric/hrv?d=2026-10-03", "/metric/skin?d=2026-10-03",
    ])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("keeps a Recovery contributor's full detail accessible while calibrating", () => {
    render(<ContributorRow variant="recovery" label="Heart rate variability" metric={{ value: null, reason: "calibrating", provisional: false, nightsLeft: 3 }} format="int" baseline={{ mean: 0, sd: 1 }} points={null} direction="up" href="/metric/hrv?d=2026-10-03" />)
    expect(screen.getByRole("link", { name: /Heart rate variability/ })).toHaveAttribute("href", "/metric/hrv?d=2026-10-03")
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })
})
