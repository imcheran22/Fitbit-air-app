import { describe, expect, it } from "vitest";
import { arms, effect } from "./journal";

describe("journal effect", () => {
  it("needs 5 days of each answer", () => {
    expect(effect([60, 61, 62, 63], [50, 51, 52, 53, 54]).label).toBe("not_enough_data");
  });
  it("golden: a clear 10-point gap", () => {
    const e = effect([60, 62, 58, 61, 59], [50, 52, 48, 51, 49]);
    // Means 60 and 50; pooled variance 2.5, SE 1, t 10 against 1.108 (8 df).
    expect(e).toMatchObject({ delta: 10, label: "positive" });
    expect(e.ciLow).toBeCloseTo(10 - 1.108, 1);
    expect(e.ciHigh).toBeCloseTo(10 + 1.108, 1);
  });
  it("a gap inside the noise is no clear effect, and the interval spans 0", () => {
    const e = effect([60, 40, 55, 45, 50], [49, 61, 39, 51, 52]);
    expect(e.label).toBe("no_clear_effect");
    expect(e.ciLow! < 0 && e.ciHigh! > 0).toBe(true);
  });
  it("pairs a behaviour on D − 1 with the score on D, within 90 days before asOf", () => {
    const score = new Map([["2026-10-02", 70], ["2026-10-03", 60]]);
    const a = arms(
      [
        { day: "2026-10-01", tags: { alcohol: 1 } },
        { day: "2026-10-02", tags: { alcohol: 0 } },
        { day: "2026-06-01", tags: { alcohol: 1 } },
      ],
      (d) => score.get(d),
      "2026-10-03",
    );
    expect(a.get("alcohol")).toEqual({ yes: [70], no: [60] });
  });
});
