import { describe, expect, it } from "vitest"
import { motionFor } from "./PageEnter"

const kind = (from: string | null, to: string, reduce = false) => {
  const m = motionFor(from, to, reduce)
  if (!m) return "none"
  const start = m.keyframes[0].transform as string | undefined
  if (start?.startsWith("translateX(-")) return "back"
  if (start?.startsWith("translateX(")) return "forward"
  if (start?.startsWith("scale")) return "tab"
  return "fade"
}

describe("motionFor", () => {
  it("leaves the launch alone", () => expect(kind(null, "/")).toBe("none"))
  it("fades a skeleton into its content", () => expect(kind("/recovery", "/recovery")).toBe("fade"))
  it("slides deeper screens in from the right", () => {
    expect(kind("/", "/recovery")).toBe("forward")
    expect(kind("/health", "/health/stress")).toBe("forward")
    expect(kind("/recovery", "/sleep")).toBe("forward")
  })
  it("slides back to the parent from the left", () => {
    expect(kind("/recovery", "/")).toBe("back")
    expect(kind("/health/stress", "/health")).toBe("back")
    expect(kind("/more/how-it-works/recovery", "/more/how-it-works")).toBe("back")
  })
  it("fades through between tabs, also from another tab's detail", () => {
    expect(kind("/", "/health")).toBe("tab")
    expect(kind("/recovery", "/journal")).toBe("tab")
  })
  it("only fades under reduced motion", () => {
    expect(kind("/", "/recovery", true)).toBe("fade")
    expect(kind("/", "/health", true)).toBe("fade")
  })
})
