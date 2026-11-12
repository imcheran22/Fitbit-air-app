import { describe, expect, it } from "vitest"
import { nextFolded, parseFolded } from "./folded"

describe("folded sections cookie", () => {
  it("adds a folded section once and removes it when opened", () => {
    expect([...parseFolded(undefined)]).toEqual([])
    const a = nextFolded(undefined, "history", false)
    expect(nextFolded(a, "history", false)).toBe("history")
    expect(nextFolded(nextFolded(a, "insights", false), "history", true)).toBe("insights")
  })
})
