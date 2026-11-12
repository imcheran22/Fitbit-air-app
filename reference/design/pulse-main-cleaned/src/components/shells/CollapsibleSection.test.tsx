import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { CollapsibleSection } from "./CollapsibleSection"

beforeEach(() => {
  document.cookie = "pulse-collapsed=; path=/; max-age=0"
})

describe("CollapsibleSection", () => {
  it("folds its body from the title, remembers it in a cookie, and starts folded when told", () => {
    const { unmount } = render(
      <CollapsibleSection id="history" title="History">
        <p>Rows</p>
      </CollapsibleSection>
    )
    const toggle = screen.getByRole("button", { name: "History" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Rows")).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Rows")).toBeNull()
    expect(document.cookie).toContain("pulse-collapsed=history")
    unmount()
    render(
      <CollapsibleSection id="history" title="History" defaultOpen={false}>
        <p>Rows</p>
      </CollapsibleSection>
    )
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-expanded", "false")
  })
})
