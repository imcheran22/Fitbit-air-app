import { describe, expect, it } from "vitest";
import { placeLabels, type LabelScene, type ValueLabel } from "./labels";

const scene = (dots: { x: number; y: number }[], extra: Partial<LabelScene> = {}): LabelScene => ({ dots: dots.map((d) => ({ ...d, r: 5 })), lines: [], top: 0, bottom: 190, above: -14, below: 16, ...extra });

/** No two label boxes overlap and no box touches a dot (the same box sizes as labels.ts). */
function clear(labels: ValueLabel[], ys: number[], s: LabelScene) {
  const boxes = labels.map((l, i) => ({ l: l.x - 16, r: l.x + 16, t: ys[i] - 6, b: ys[i] + 6 }));
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b).toBe(false)));
  for (const a of boxes) for (const d of s.dots) expect(Math.max(a.t - d.y, d.y - a.b, 0) >= d.r || Math.max(a.l - d.x, d.x - a.r, 0) >= d.r).toBe(true);
  for (const a of boxes) expect(a.t >= s.top && a.b <= s.bottom).toBe(true);
}

describe("placeLabels", () => {
  it("keeps the preferred sides when they are free", () => {
    const labels: ValueLabel[] = [{ x: 50, y: 40, text: "80%", prefer: "above" }, { x: 50, y: 150, text: "4.2", prefer: "below" }];
    const s = scene(labels);
    expect(placeLabels(labels, s)).toEqual([26, 166]);
  });

  it("separates the owner's Wed 30: strain 5.3 below its dot ran into Recovery 5% above the dot 32 px lower", () => {
    const labels: ValueLabel[] = [{ x: 50, y: 142, text: "5.3", prefer: "below" }, { x: 50, y: 174, text: "5%", prefer: "above" }];
    const s = scene(labels);
    const ys = placeLabels(labels, s);
    clear(labels, ys, s);
  });

  it("puts labels on opposite sides when the dots nearly meet", () => {
    const labels: ValueLabel[] = [{ x: 50, y: 100, text: "12.0", prefer: "above" }, { x: 50, y: 103, text: "64%", prefer: "above" }];
    const s = scene(labels);
    const ys = placeLabels(labels, s);
    clear(labels, ys, s);
    expect(ys[0] < 100 !== ys[1] < 103).toBe(true);
  });

  it("stays above the floor and still clears both dots", () => {
    const labels: ValueLabel[] = [{ x: 50, y: 178, text: "0.4", prefer: "below" }, { x: 50, y: 184, text: "3%", prefer: "below" }];
    const s = scene(labels);
    clear(labels, ys(labels, s), s);
  });

  it("moves off another series' line when a free side exists", () => {
    const labels: ValueLabel[] = [{ x: 50, y: 100, text: "12.0", prefer: "above" }];
    const s = scene(labels, { lines: [[{ x: 0, y: 86 }, { x: 100, y: 86 }]] });
    expect(placeLabels(labels, s)).toEqual([116]);
  });
});

const ys = (l: ValueLabel[], s: LabelScene) => placeLabels(l, s);
