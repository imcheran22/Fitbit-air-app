// Value labels that never cover another label or a dot. Each label sits above or below its point, on the side the
// chart prefers (the web's rule for that chart); when that collides, it takes the other side, and only when neither
// side is free does it move further out, a label-height at a time. Lines are a soft cost: the label's halo keeps a crossing
// line from striking through the digits, so a line is avoided when it can be, never at the price of a collision.

export type Point = { x: number; y: number };
export type ValueLabel = Point & {
  /** The label's text, for its width (12 px bold numerals). */
  text: string;
  /** The chart's preferred side. */
  prefer: "above" | "below";
};
export type LabelScene = {
  /** Every dot drawn, with its radius (stroke included). */
  dots: (Point & { r: number })[];
  /** Every polyline drawn, as runs of connected points. */
  lines: Point[][];
  /** The labels' vertical room: their boxes stay inside [top, bottom]. */
  top: number;
  bottom: number;
  /** Centre offsets from the point: above is negative, below positive. */
  above: number;
  below: number;
};

/** A series' drawn runs, as linePath draws it: a missing value breaks the line. */
export function runs(points: { x: number; y: number | null }[]) {
  const out: Point[][] = [];
  points.forEach((p, i) => {
    if (p.y === null) return;
    if (i === 0 || points[i - 1].y === null) out.push([]);
    out[out.length - 1].push({ x: p.x, y: p.y });
  });
  return out;
}

/** A label's box: 12 px bold digits run about 7 px wide (a "." or "," about 3), the glyphs about 12 px tall. */
const H = 12;
const widthOf = (text: string) => [...text].reduce((w, ch) => w + (ch === "." || ch === "," ? 3 : 7), 2);

type Box = { l: number; r: number; t: number; b: number };
const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const hitsDot = (a: Box, d: Point & { r: number }) => {
  const cx = Math.max(a.l, Math.min(d.x, a.r));
  const cy = Math.max(a.t, Math.min(d.y, a.b));
  return (cx - d.x) ** 2 + (cy - d.y) ** 2 < (d.r + 1) ** 2;
};
/** Whether segment p-q passes through the box (Liang-Barsky clipping). */
const crosses = (a: Box, p: Point, q: Point) => {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pk, qk] of [[-dx, p.x - a.l], [dx, a.r - p.x], [-dy, p.y - a.t], [dy, a.b - p.y]]) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const t = qk / pk;
      if (pk < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
};

/**
 * Centre y for each label (same order). Labels sharing a column (the same x) are placed together, trying every pair of
 * sides; columns go left to right, each avoiding the labels already placed.
 */
export function placeLabels(labels: ValueLabel[], scene: LabelScene): number[] {
  const out = new Array<number>(labels.length);
  const placed: Box[] = [];
  const columns = new Map<number, number[]>();
  labels.forEach((l, i) => columns.set(Math.round(l.x), [...(columns.get(Math.round(l.x)) ?? []), i]));
  const segments = scene.lines.flatMap((run) => run.slice(1).map((q, k) => [run[k], q] as const));

  for (const ids of [...columns.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)) {
    // Near, then one and two label-heights further out: above / below.
    const offsets = [0, 1, 2].flatMap((n) => [scene.above - n * (H + 2), scene.below + n * (H + 2)]);
    let best: { cost: number; ys: number[]; boxes: Box[] } | null = null;
    const choose = (k: number, ys: number[], boxes: Box[], cost: number) => {
      if (best && cost >= best.cost) return;
      if (k === ids.length) {
        best = { cost, ys, boxes };
        return;
      }
      const l = labels[ids[k]];
      const half = widthOf(l.text) / 2;
      offsets.forEach((dy, n) => {
        const y = l.y + dy;
        const box = { l: l.x - half, r: l.x + half, t: y - H / 2, b: y + H / 2 };
        let c = (dy < 0) === (l.prefer === "above") ? 0 : 2;
        c += 3 * Math.floor(n / 2);
        if (box.t < scene.top || box.b > scene.bottom) c += 1000;
        for (const o of [...placed, ...boxes]) if (overlaps(box, o)) c += 1000;
        for (const d of scene.dots) if (hitsDot(box, d)) c += 1000;
        for (const [p, q] of segments) if (crosses(box, p, q)) c += 5;
        choose(k + 1, [...ys, y], [...boxes, box], cost + c);
      });
    };
    choose(0, [], [], 0);
    const pick = best as { ys: number[]; boxes: Box[] } | null;
    ids.forEach((id, k) => (out[id] = pick!.ys[k]));
    placed.push(...pick!.boxes);
  }
  return out;
}
