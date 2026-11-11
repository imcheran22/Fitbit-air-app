import { describe, expect, it } from "vitest";
import { blobRadius, lowestEdge, noise2, ORB, orbColors as colors, particleCount, particleLayer, rng, swirlVelocity, type RGB, type Token } from "./orb";

// The orb resolves tokens from the palette; here a fixed table with the same hues stands in (pulse's test's table).
const TOKENS: Record<string, RGB> = {
  "orb-green": [76, 212, 140],
  "orb-teal": [60, 198, 174],
  "orb-cyan": [124, 196, 212],
  "orb-blue": [88, 136, 192],
  "orb-blue-2": [94, 140, 192],
  "orb-olive": [106, 132, 82],
  "orb-orange": [212, 132, 58],
  "orb-amber": [200, 134, 46],
  "orb-rust": [201, 98, 47],
  "orb-red": [216, 69, 58],
  "orb-empty": [92, 98, 104],
};
const rgb = (t: Token) => TOKENS[t];
const orbColors = (d: number | null) => colors(d, rgb);

const first = ORB.stops[0];
const last = ORB.stops[ORB.stops.length - 1];
const level = ORB.stops.find((s) => s.at === 0)!;

describe("orbColors", () => {
  it("is green at and below the younger end", () => {
    expect(orbColors(first.at)).toEqual({ top: rgb(first.top), bottom: rgb(first.bottom) });
    expect(orbColors(-12)).toEqual(orbColors(first.at));
  });
  it("is red at and above the older end", () => {
    expect(orbColors(last.at)).toEqual({ top: rgb(last.top), bottom: rgb(last.bottom) });
    expect(orbColors(20)).toEqual(orbColors(last.at));
  });
  it("warms from amber through rust to red as the years add up", () => {
    const g = (d: number) => orbColors(d).top[1];
    expect(g(3)).toBeGreaterThan(g(7));
    expect(g(7)).toBeGreaterThan(g(12));
  });
  it("is blue at zero", () => {
    expect(orbColors(0)).toEqual({ top: rgb(level.top), bottom: rgb(level.bottom) });
  });
  it("gives each step its own hue: no two of these deltas share a colour", () => {
    const keys = [-8, -4, -1.5, 0, 3, 7, 12].map((d) => orbColors(d).top.join());
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("splits blue over warm in between (mixed references)", () => {
    const { top, bottom } = orbColors(1.8);
    expect(top[2]).toBeGreaterThan(top[0]); // blue on top
    expect(bottom[0]).toBeGreaterThan(bottom[2]); // orange underneath
  });
  it("is continuous across a stop", () => {
    const a = orbColors(0.8 - 1e-6).bottom;
    const b = orbColors(0.8 + 1e-6).bottom;
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(0.01));
  });
  it("is grey with no result", () => {
    expect(orbColors(null)).toEqual({ top: rgb(ORB.empty), bottom: rgb(ORB.empty) });
    expect(orbColors(Number.NaN)).toEqual(orbColors(null));
  });
});

describe("shape noise", () => {
  it("is deterministic and bounded", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * 0.11 + 3;
      expect(noise2(x, y)).toBe(noise2(x, y));
      expect(Math.abs(noise2(x, y))).toBeLessThanOrEqual(1);
    }
    expect(blobRadius(1.3, 4.2, 7)).toBe(blobRadius(1.3, 4.2, 7));
  });
  it("closes the edge and stays near a circle", () => {
    expect(blobRadius(0, 2, 5)).toBeCloseTo(blobRadius(Math.PI * 2, 2, 5), 10);
    const max = 1 + ORB.shape.lowAmp + ORB.shape.smallHighAmp;
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const r = blobRadius(a, 3, 9, true);
      expect(r).toBeGreaterThanOrEqual(2 - max);
      expect(r).toBeLessThanOrEqual(max);
    }
  });
  it("seeded rng repeats", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("scales particle count with size within the cap", () => {
    expect(particleCount(300)).toBeGreaterThanOrEqual(2000);
    expect(particleCount(300)).toBeLessThanOrEqual(3000);
    expect(particleCount(2000)).toBe(ORB.particles.max);
    expect(particleCount(40)).toBe(ORB.particles.min);
  });
});

// Halo's checks on the static-layer orb's motion (src/screens/health/AgeOrb.tsx).
const M = ORB.motion;
const STEPS = 128;
const TAU = Math.PI * 2;

/** The settled outline AgeOrb draws, in px, for a seed and size. */
function outline(seed: number, size: number) {
  const R = (size / 2) * ORB.shape.radius;
  return Array.from({ length: STEPS + 1 }, (_, i) => R * blobRadius((i / STEPS) * TAU, 10, seed, size < 160, 1));
}

/** The outline's radius at any angle, interpolated between table samples (finer than the drawing's own lookup). */
function radiusAt(rTab: number[], a: number) {
  const x = ((((a % TAU) + TAU) % TAU) / TAU) * STEPS;
  const i = Math.floor(x);
  const f = x - i;
  return rTab[i] * (1 - f) + rTab[Math.min(STEPS, i + 1)] * f;
}

describe("orb motion clock", () => {
  it("restarts seamlessly: every wave period divides the loop and every drift is whole turns", () => {
    for (const period of [M.breath, M.twinkle, M.twinkleInner, M.sway, M.shimmer]) expect(Number.isInteger(M.loop / period)).toBe(true);
    for (const turns of [M.turnsA, M.turnsB, M.turnsShimmer]) expect(Number.isInteger(turns)).toBe(true);
  });
});

describe("swirlVelocity", () => {
  it("ramps up with the hold and then matches the loop's steady speed", () => {
    expect(swirlVelocity(0)).toBe(0);
    expect(swirlVelocity(-5)).toBe(0);
    expect(swirlVelocity(M.swirl.ramp / 2)).toBeCloseTo(swirlVelocity(M.swirl.ramp) / 2, 12);
    expect(swirlVelocity(M.swirl.ramp)).toBeCloseTo(1 / M.swirl.period, 12);
    expect(swirlVelocity(10_000)).toBeCloseTo(1 / M.swirl.period, 12);
  });
});

describe("particleLayer", () => {
  it("only lets particles turn as far as the outline allows", () => {
    const sway = (M.swayDeg * Math.PI) / 180;
    for (const size of [300, 260, 108]) {
      for (let seed = 3; seed < 92; seed++) {
        const rTab = outline(seed, size);
        const minEdge = Math.min(...rTab);
        for (let j = 0; j < 48; j++) {
          const a = (j / 48) * TAU;
          for (const depth of [0.3, 0.6, 0.8, 0.9, 0.97]) {
            const dist = radiusAt(rTab, a) * depth;
            const layer = particleLayer(rTab, STEPS, minEdge, a, dist, 1.5, sway);
            if (layer === "free") for (let k = 0; k < 72; k++) expect(dist + 1.5).toBeLessThanOrEqual(radiusAt(rTab, a + (k / 72) * TAU) + 1e-6);
            else if (layer === "sway") for (const f of [-1, -0.5, 0, 0.5, 1]) expect(dist + 1.5).toBeLessThanOrEqual(radiusAt(rTab, a + f * sway) + 0.5);
          }
        }
      }
    }
  });

  it("reads the lowest edge around an angle", () => {
    const rTab = Array.from({ length: STEPS + 1 }, (_, i) => (i === 10 ? 50 : 100));
    const at = (i: number) => (i / STEPS) * TAU;
    expect(lowestEdge(rTab, STEPS, at(11), TAU / STEPS)).toBe(50);
    expect(lowestEdge(rTab, STEPS, at(20), TAU / STEPS)).toBe(100);
  });
});
