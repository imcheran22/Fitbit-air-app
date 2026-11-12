import { describe, expect, it } from "vitest"
import { ordinal } from "./format"

describe("ordinal", () => {
  it("picks the English suffix from Intl.PluralRules", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 78, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "78th", "101st", "111th",
    ])
  })
})
