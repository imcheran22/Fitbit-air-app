import {
  campScene, mergeRuns, pathRects, PEEK_RESERVE, PX, toPaths, type CampSceneGeometry, type Rect,
} from '../../src/components/social/campSceneGeometry';

const WIDTHS = [375, 390, 393, 402, 414, 428, 430];
const HEIGHTS = [667, 736, 812, 844, 852, 874, 896, 926, 932];
const sizes = WIDTHS.flatMap((w) => HEIGHTS.map((h) => [w, h] as const));
const allRects = (g: CampSceneGeometry): Rect[] => [
  ...pathRects(g.back), ...pathRects(g.glow), ...g.twinkles.flatMap(pathRects), ...pathRects(g.front),
  ...pathRects(g.flameA), ...pathRects(g.flameB), ...pathRects(g.logs),
];

it('puts every rect on the 4-px grid, and the fire box with it', () => {
  for (const [w, h] of sizes) {
    for (const night of [true, false]) {
      const g = campScene(w, h, night, 47);
      for (const r of allRects(g)) {
        expect([r.x % PX, r.y % PX, r.w % PX, r.h % PX].map(Math.abs)).toEqual([0, 0, 0, 0]);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
      expect([g.fire.left % PX, g.fire.top % PX]).toEqual([0, 0]);
    }
  }
});

it('draws the moon, the constellations and twinkling stars only at night, and lights the ground only then', () => {
  const night = campScene(390, 844, true, 47);
  const day = campScene(390, 844, false, 47);
  expect(night.moon).not.toBeNull();
  expect(night.labels.map((l) => l.text)).toEqual(['CASSIOPEIA', 'BIG DIPPER']);
  expect(night.twinkles.flat().length).toBeGreaterThan(0);
  expect(night.glow.length).toBe(3);
  expect(night.flameA.length).toBeGreaterThan(0);
  expect(night.sparks.length).toBe(5);
  expect(day.moon).toBeNull();
  expect(day.labels).toEqual([]);
  expect(day.twinkles.flat()).toEqual([]);
  expect(day.glow).toEqual([]);
  expect(day.flameA).toEqual([]);
  expect(day.sparks).toEqual([]);
  // The day's logs carry grey ash.
  expect(pathRects(day.logs).some((r) => r.c === '#A8A29E')).toBe(true);
  expect(pathRects(night.logs).some((r) => r.c === '#A8A29E')).toBe(false);
  // The moon and the constellations sit in the sky, above the horizon.
  expect(night.moon!.top + night.moon!.height).toBeLessThanOrEqual(night.horizon);
  for (const l of night.labels) expect(l.y).toBeLessThan(night.horizon);
});

it('sits every seat on the ring round the fire, on the ground, apart from the others and the fire', () => {
  const overlaps = (a: { left: number; top: number; width: number; height: number }, b: typeof a) =>
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  for (const [w, h] of sizes) {
    const g = campScene(w, h, true, 47);
    const { cx, cy, rx, ry } = g.ring;
    expect(g.seats).toHaveLength(8);
    expect(g.seats.map((s) => s.row)).toEqual(['front', 'front', 'side', 'side', 'back', 'back', 'front', 'front']);
    for (const s of g.seats) {
      // Feet on the ellipse (within the 4-px snap).
      expect(Math.abs(((s.footX - cx) / rx) ** 2 + ((s.footY - cy) / ry) ** 2 - 1)).toBeLessThan(0.06);
      expect(s.facesRight).toBe(s.footX < cx);
      expect(s.top).toBeGreaterThanOrEqual(g.horizon);
      expect(s.top + s.height).toBeLessThanOrEqual(h - PEEK_RESERVE);
      expect(overlaps(s, g.fire)).toBe(false);
    }
    g.seats.forEach((a, i) => g.seats.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
    // An even ring: mirrored pairs, and the four columns evenly spaced.
    for (let i = 0; i < 8; i += 2) {
      expect(g.seats[i]!.footY).toBe(g.seats[i + 1]!.footY);
      expect(cx - g.seats[i]!.footX).toBe(g.seats[i + 1]!.footX - cx);
    }
    // The fire sits on the ground, in the ring.
    expect(g.fire.top).toBeGreaterThan(g.horizon);
  }
});

it('merges same-colour runs and keeps the static scene to a few dozen SVG paths', () => {
  expect(mergeRuns([
    { x: 0, y: 0, w: 4, h: 4, c: 'a' }, { x: 4, y: 0, w: 4, h: 4, c: 'a' }, { x: 12, y: 0, w: 4, h: 4, c: 'a' }, { x: 4, y: 4, w: 4, h: 4, c: 'a' },
  ])).toEqual([{ x: 0, y: 0, w: 8, h: 4, c: 'a' }, { x: 12, y: 0, w: 4, h: 4, c: 'a' }, { x: 4, y: 4, w: 4, h: 4, c: 'a' }]);
  expect(toPaths([{ x: 0, y: 0, w: 4, h: 4, c: 'a' }, { x: 0, y: 4, w: 8, h: 4, c: 'b' }])).toEqual([
    { c: 'a', d: 'M0 0h4v4h-4z' }, { c: 'b', d: 'M0 4h8v4h-8z' },
  ]);
  for (const [w, h] of sizes) {
    const g = campScene(w, h, true, 47);
    const paths = g.back.length + g.glow.length + g.twinkles.flat().length + g.front.length + g.flameA.length + g.flameB.length + g.logs.length;
    expect(paths).toBeLessThan(60);
  }
});

it('is pure: the same size gives the same scene', () => {
  expect(campScene(390, 844, true, 47)).toEqual(campScene(390, 844, true, 47));
});
