import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { SectionShell } from "./SectionShell"
import { cardInfo } from "./cardInfo"
import { DASHBOARD_METRICS } from "@/lib/dashboard"

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }))

afterEach(cleanup)

describe("card explanations", () => {
  it.each(DASHBOARD_METRICS)("explains the dashboard metric $label", ({ label }) => {
    expect(cardInfo(label)?.body).toBeTruthy()
  })

  it("keeps compact monitor cards tappable without an explanation button", () => {
    render(<SectionShell variant="card" title="Stress Monitor" info={false} href="/health/stress"><p>1.2</p></SectionShell>)
    expect(screen.queryByRole("button", { name: "About Stress Monitor" })).toBeNull()
    expect(screen.getByRole("link", { name: "Stress Monitor" }).getAttribute("href")).toBe("/health/stress")
  })

  it("keeps compact metric cards tappable without an explanation button", () => {
    render(<KeyStatRow variant="card" label="Heart rate variability" metric={{ value: 50, reason: null, provisional: false }} format="int" unit="ms" direction="up" href="/metric/hrv" />)
    expect(screen.queryByRole("button", { name: "About Heart rate variability" })).toBeNull()
    expect(screen.getByRole("link").getAttribute("href")).toBe("/metric/hrv")
  })

  it("uses the supplied context for cards with an ambiguous title", () => {
    render(<SectionShell variant="card" title="Today" info={{ title: "Stress today", body: "Only still minutes are scored." }}><p>1.2</p></SectionShell>)
    fireEvent.click(screen.getByRole("button", { name: "About Today" }))
    expect(screen.getByRole("dialog", { name: "Stress today" })).toBeTruthy()
    expect(screen.getByText("Only still minutes are scored.")).toBeTruthy()
  })
})
