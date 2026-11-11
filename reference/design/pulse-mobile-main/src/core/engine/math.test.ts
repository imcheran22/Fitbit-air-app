import { describe, expect, it } from "vitest";
import { clamp, mean, popStats, roundHalfAway } from "./math";

describe("roundHalfAway", () => {
  it("rounds halves away from zero (the source's labels rounded half to even: 66.5 showed 66)", () => {
    expect(roundHalfAway(66.5)).toBe(67);
    expect(roundHalfAway(67.5)).toBe(68);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(roundHalfAway(1.25, 1)).toBe(1.3);
    expect(roundHalfAway(0.4)).toBe(0);
  });
});

describe("stats", () => {
  it("means and population SD", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
    expect(popStats([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mean: 5, sd: 2, n: 8 });
    expect(clamp(120, 1, 100)).toBe(100);
  });
});
