import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Prose } from "./Prose"

describe("Prose", () => {
  it("splits a lead-in line from the list that follows it, and keeps bold", () => {
    const { container } = render(<Prose text={"Here is the plan:\n- **Today:** easy\n- Rest\n\n1. One\n2. Two\n\nDone."} />)
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Here is the plan:", "Done."])
    expect([...container.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["Today: easy", "Rest"])
    expect([...container.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual(["One", "Two"])
    expect(container.querySelector("strong")?.textContent).toBe("Today:")
  })

  it("leaves an unclosed ** (mid-stream) as text", () => {
    const { container } = render(<Prose text="Take it **eas" />)
    expect(container.textContent).toBe("Take it **eas")
  })
})
