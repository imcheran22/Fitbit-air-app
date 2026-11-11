// The Campfire's pixel scene (design: PixelScene, owner-approved 2026-10-07) as plain geometry. Everything sits on a
// 4-px grid. `campScene(width, height, night, topInset)` is pure and is computed once per screen size; CampScene draws it. The
// mockup is 390 × 844: x positions scale with the width, the sky's features with the sky's height, and the ring of
// seats is fixed in shape and centred in the ground between the horizon and the panel's Peek top.

export const PX = 4;
/** The room the panel takes at Peek (its tallest, with a 34-px home indicator): nothing on the ground goes below it. */
export const PEEK_RESERVE = 140;
/**
 * The floating chrome, in px below the safe-area top: the pills (8 down, 40 tall), then the kicker (16-px line), a
 * 2-px gap and the one-line headline (28-px line) from 62 down. The screen lays them out from these numbers.
 */
export const CHROME = { pillsTop: 8, pillsHeight: 40, headlineTop: 62, headlineHeight: 48 } as const;
/** Where the floating chrome ends, for a top inset: the horizon (so every seat and bubble) is never above it. */
export const chromeBottom = (topInset: number) => topInset + CHROME.headlineTop + CHROME.headlineHeight;

/** One seat's slot: bubble, coach, log and name. */
export const SEAT_W = 76;
export const BUBBLE_H = 20;
/** Bubble's tail and the gap under it, above the coach. */
export const BUBBLE_GAP = 8;
/** Two 4-px rows of log, then a 14-px name line. */
export const LOG_H = 8;
export const NAME_H = 14;
/** The fire: 13 rows of flame over 3 rows of logs, 11 cells wide. */
export const FIRE_W = 44;
export const FIRE_H = 64;
/** Coach sizes: the back pair is smaller (about 0.84), the side pair 0.9, the front four full size. */
export const COACH_SIZE = { back: 40, side: 44, front: 48 } as const;

export interface Rect { x: number; y: number; w: number; h: number; c: string }
export interface Box { left: number; top: number; width: number; height: number }
export type SeatRow = keyof typeof COACH_SIZE;
export interface Seat extends Box {
  row: SeatRow;
  /** The coach's size in px. */
  size: number;
  /** Where the coach's feet meet its log: the centre of its bottom edge. */
  footX: number;
  footY: number;
  /** Which way the fire is. */
  facesRight: boolean;
}
/** One colour's rects as an SVG path (`d`), in paint order. */
export interface PathLayer { c: string; d: string }
export interface SceneText { text: string; x: number; y: number }

export interface CampSceneGeometry {
  width: number;
  height: number;
  night: boolean;
  /** The ground's top edge. */
  horizon: number;
  sky: string;
  ground: string;
  /** Sky, stars, constellation lines, moon or sun, mountains, pines and ground: never animated. */
  back: PathLayer[];
  /** Firelight on the ground (night only): three stepped ellipse rings that flicker together. */
  glow: PathLayer[];
  /** Twinkling stars in four phase groups (night only). */
  twinkles: PathLayer[][];
  /** The tent, drawn over the firelight. */
  front: PathLayer[];
  /** Constellation names (night only). */
  labels: SceneText[];
  /** The moon (night only), for its label. */
  moon: Box | null;
  fire: Box;
  /** Relative to `fire`: the two flame frames, and the logs (with ash by day). */
  flameA: PathLayer[];
  flameB: PathLayer[];
  logs: PathLayer[];
  /** Spark columns inside the fire box, and each one's delay in s. */
  sparks: Array<{ x: number; delay: number }>;
  /** Eight seats: [0] is mine, then up to 7 buddies. */
  seats: Seat[];
  /** The ring's centre and radii (feet sit on it). */
  ring: { cx: number; cy: number; rx: number; ry: number };
}

const snap = (v: number) => Math.round(v / PX) * PX;

const NIGHT = {
  s1: '#0B0E26', s2: '#10143A', s3: '#171C4A', mt: '#1C2150', ridge: '#2A3170', tree: '#0B0D28', ground: '#151936',
  speck: '#1C2148', tent: '#3B2F6B', tentHi: '#4C3F86', door: '#F59E0B',
};
const DAY = {
  s1: '#6FB1E6', s2: '#86C0EC', s3: '#A3D2F2', mt: '#7FA3C4', ridge: '#A7C3DC', tree: '#2F5A33', ground: '#5B7F3A',
  speck: '#6A9045', tent: '#E07A3F', tentHi: '#F0965E', door: '#7C2D12',
};
const STAR = '#E0E7FF';
const STAR_CROSS = '#8B95E0';
const CONSTELLATION_LINE = '#3B4080';
const CONSTELLATION_STAR = '#EEF2FF';

/**
 * Rects to SVG paths, one per colour in the order each colour first appears. Only use this within a layer whose
 * colours never need to paint over a later colour (each layer below is built that way). Same-colour runs that touch
 * on a row are merged first.
 */
export function toPaths(rects: readonly Rect[]): PathLayer[] {
  const order: string[] = [];
  const byColour = new Map<string, Rect[]>();
  for (const r of rects) {
    if (!byColour.has(r.c)) {
      byColour.set(r.c, []);
      order.push(r.c);
    }
    byColour.get(r.c)!.push(r);
  }
  return order.map((c) => ({
    c,
    d: mergeRuns(byColour.get(c)!).map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`).join(''),
  }));
}

/** Same-colour rects on one row (same top and height) that touch or overlap become one rect. */
export function mergeRuns(rects: readonly Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.h - b.h || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.c === r.c && last.y === r.y && last.h === r.h && r.x <= last.x + last.w) {
      last.w = Math.max(last.w, r.x + r.w - last.x);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Character rows to 4-px cells: each letter in `map` is a colour, anything else is empty. */
function cells(rows: readonly string[], map: Record<string, string>): Rect[] {
  const out: Rect[] = [];
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    const c = map[ch];
    if (c) out.push({ x: rx * PX, y: ry * PX, w: PX, h: PX, c });
  }));
  return out;
}

const FLAME = { o: '#F97316', y: '#FBBF24', w: '#FEF3C7', r: '#DC2626' };
const FLAME_A = ['....r......', '....oo.....', '...ooo.....', '...oyor....', '..ooyyo..r.', '..oyyyoo.o.', '.ooyyyyooo.', '.oyywyyyoo.', 'ooyywwyyyoo', 'ooyywwwyyoo', 'oyywwwwwyyo', 'oyywwwwwyyo', '.oyywwwyyo.'];
const FLAME_B = ['......r....', '.....oo....', '.....ooo...', '....royo...', '.r..oyyoo..', '.o.ooyyyo..', '.oooyyyyoo.', '.ooyyywyyo.', 'ooyyywwyyoo', 'ooyywwwyyoo', 'oyywwwwwyyo', 'oyywwwwwyyo', '.oyywwwyyo.'];
const LOGS = ['LL.......LL', 'BLLL...LLLB', '.BBLLLLLBB.'];
const LOG_TOP = 13;

/**
 * The ring. Feet sit on an ellipse round the fire at four evenly spaced columns, x = ±0.3·rx and ±0.9·rx (the ellipse
 * at 72.5° and 25.8° from level), so each column is 0.6·rx apart: rx ≥ 128 keeps that ≥ 76, a seat's width. The inner
 * columns' feet are 0.954·ry from the centre (the back pair above, the front pair below), the outer columns' 0.436·ry.
 * With ry = 116 (snapped: 112 and 52):
 *   back pair:  bottom = cy − 112 + 22 = cy − 90, above the fire's top (cy − 52)
 *   front pair: top    = cy + 112 − 76 = cy + 36, below the fire's base (cy + 12)
 *   side vs front-side (same column): side bottom cy − 52 + 22 = cy − 30, front-side top cy + 52 − 76 = cy − 24
 * The ring spans cy − 180 (the back pair's bubble) to cy + 134 (the front names): RING_SPAN = 314.
 */
const RY = 116;
const RING_ABOVE = 180;
export const RING_SPAN = 314;

function seat(row: SeatRow, footX: number, footY: number, cx: number): Seat {
  const size = COACH_SIZE[row];
  const top = footY - size - BUBBLE_GAP - BUBBLE_H;
  return {
    row, size, footX, footY, facesRight: footX < cx,
    left: footX - SEAT_W / 2, top, width: SEAT_W, height: footY + LOG_H + NAME_H - top,
  };
}

/**
 * The ground band (horizon to the Peek top) is at least the ring plus 16 px, or 38% of the screen (the mockup's 320
 * of 844), whichever is more; the ring is centred in it. A short phone gets a short sky, a tall one a tall sky. The
 * horizon never rises above the floating chrome (`chromeBottom(topInset)`); if it had to, the band shrinks instead.
 */
export function campScene(width: number, height: number, night: boolean, topInset: number): CampSceneGeometry {
  const C = night ? NIGHT : DAY;
  const peekTop = height - PEEK_RESERVE;
  const horizon = Math.max(snap(peekTop - Math.max(RING_SPAN + 16, Math.round(height * 0.38))), Math.ceil(chromeBottom(topInset) / PX) * PX);
  const band = peekTop - horizon;
  const kx = width / 390;
  const ky = horizon / 384;
  const sx = (x: number) => snap(x * kx);
  const sy = (y: number) => snap(y * ky);

  const cx = snap(width / 2);
  const cy = snap(horizon + Math.max(0, band - RING_SPAN) / 2 + RING_ABOVE);
  const rx = snap(Math.min(148, Math.max(128, width * 0.34)));
  const inner = snap(rx * 0.3);
  const outer = inner + Math.max(SEAT_W, snap(rx * 0.6));
  const innerY = snap(RY * 0.954);
  const outerY = snap(RY * 0.436);
  const seats = [
    // Mine first: front left, then the front right, the sides, the back pair and the front corners.
    seat('front', cx - inner, cy + innerY, cx),
    seat('front', cx + inner, cy + innerY, cx),
    seat('side', cx - outer, cy - outerY, cx),
    seat('side', cx + outer, cy - outerY, cx),
    seat('back', cx - inner, cy - innerY, cx),
    seat('back', cx + inner, cy - innerY, cx),
    seat('front', cx - outer, cy + outerY, cx),
    seat('front', cx + outer, cy + outerY, cx),
  ];
  // 4 px left of centre, so its cells stay on the grid (it is 11 cells wide).
  const fire: Box = { left: cx - FIRE_W / 2 - 2, top: cy - 52, width: FIRE_W, height: FIRE_H };

  const add = (list: Rect[], x: number, y: number, w: number, h: number, c: string) =>
    list.push({ x: snap(x), y: snap(y), w: Math.max(PX, snap(w)), h: Math.max(PX, snap(h)), c });

  // ---- Sky: three bands, each joined to the one above by a checkerboard dither row. ----
  const sky: Rect[] = [];
  const b2 = horizon - sy(196);
  const b3 = horizon - sy(84);
  add(sky, 0, b2, width, b3 - b2, C.s2);
  add(sky, 0, b3, width, horizon - b3, C.s3);
  for (let x = 0; x < width; x += 2 * PX) {
    add(sky, x, b2, PX, PX, C.s2);
    add(sky, x + PX, b2 - PX, PX, PX, C.s2);
    add(sky, x, b3, PX, PX, C.s3);
    add(sky, x + PX, b3 - PX, PX, PX, C.s3);
  }

  const stars: Rect[] = [];
  const twinkles: Rect[][] = [[], [], [], []];
  const labels: SceneText[] = [];
  let moon: Box | null = null;
  const skyTop = sy(36);
  const skySpan = Math.max(PX, sy(240));
  if (night) {
    for (let i = 0; i < 40; i++) {
      const x = snap(((i * 97 + 31) % 376 + 6) * kx);
      const y = snap(skyTop + ((i * 53 + 17) % 240) * (skySpan / 240));
      if (i % 9 === 0) {
        const group = twinkles[i % 4]!;
        group.push({ x, y, w: PX, h: PX, c: STAR });
        for (const [dx, dy] of [[-PX, 0], [PX, 0], [0, -PX], [0, PX]] as const) group.push({ x: x + dx, y: y + dy, w: PX, h: PX, c: STAR_CROSS });
      } else if (i % 3 === 0) {
        twinkles[(i + 1) % 4]!.push({ x, y, w: PX, h: PX, c: STAR });
      } else {
        add(stars, x, y, PX, PX, i % 2 ? '#7C86C8' : '#B9C2F2');
      }
    }
    // Cassiopeia's W overhead and the Big Dipper lower down: dotted lines between brighter 8-px stars.
    const at = (p: readonly [number, number]) => [sx(p[0]), sy(p[1])] as const;
    const cas = ([[196, 48], [222, 74], [246, 56], [270, 82], [298, 60]] as const).map(at);
    const dip = ([[196, 206], [226, 198], [252, 210], [276, 214], [300, 228], [334, 222], [340, 252], [304, 258], [300, 228]] as const).map(at);
    const dotted = (a: readonly [number, number], b: readonly [number, number]) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const n = Math.floor(Math.hypot(dx, dy) / 8);
      for (let k = 1; k < n; k++) add(stars, a[0] + (dx * k) / n, a[1] + (dy * k) / n, PX, PX, CONSTELLATION_LINE);
    };
    for (let i = 1; i < cas.length; i++) dotted(cas[i - 1]!, cas[i]!);
    for (let i = 1; i < dip.length; i++) dotted(dip[i - 1]!, dip[i]!);
    // The Dipper's last point closes the bowl on an earlier one: draw it once.
    [...cas, ...dip.slice(0, -1)].forEach((p, i) => twinkles[i % 4]!.push({ x: p[0] - PX, y: p[1] - PX, w: 2 * PX, h: 2 * PX, c: CONSTELLATION_STAR }));
    labels.push({ text: 'CASSIOPEIA', x: sx(236), y: sy(100) }, { text: 'BIG DIPPER', x: sx(200), y: sy(240) });

    // A crescent: a disc less an offset disc, inside a 1-pixel halo ring.
    const mx = width - snap(70 * kx);
    const my = sy(148);
    for (let gx = -8; gx <= 8; gx++) for (let gy = -8; gy <= 8; gy++) {
      const d = Math.hypot(gx, gy);
      const cut = Math.hypot(gx - 3, gy + 2) <= 4.6;
      if (d <= 5.2 && !cut) add(stars, mx + gx * PX, my + gy * PX, PX, PX, gy < 0 ? '#F8FAFC' : '#E2E8F0');
      else if (d > 6.2 && d <= 7.2) add(stars, mx + gx * PX, my + gy * PX, PX, PX, '#1A2052');
    }
    moon = { left: mx - 7 * PX, top: my - 7 * PX, width: 15 * PX, height: 15 * PX };
  } else {
    // A sun with a dithered halo, and three clouds.
    const ux = width - snap(74 * kx);
    const uy = sy(150);
    for (let gx = -8; gx <= 8; gx++) for (let gy = -8; gy <= 8; gy++) {
      const d = Math.hypot(gx, gy);
      if (d <= 5.2) add(stars, ux + gx * PX, uy + gy * PX, PX, PX, d < 3 ? '#FEF3C7' : '#FDE68A');
      else if (d > 6.2 && d <= 7.2 && (gx + gy) % 2 === 0) add(stars, ux + gx * PX, uy + gy * PX, PX, PX, '#FDE68A');
    }
    for (const [x, y, n] of [[40, 170, 24], [64, 160, 12], [232, 224, 16]] as const) {
      add(stars, sx(x), sy(y), n * PX, 12, '#F8FAFC');
      add(stars, sx(x) + 8, sy(y) - 8, (n - 4) * PX, 8, '#F8FAFC');
    }
  }

  // ---- Mountains: stepped columns under a lighter 1-pixel ridge. ----
  const hills: Rect[] = [];
  const peaks = ([[0, 330], [48, 290], [92, 322], [140, 274], [196, 326], [238, 298], [286, 332], [332, 290], [390, 326]] as const)
    .map(([x, y]) => [x * kx, horizon - (384 - y) * Math.min(1, ky)] as const);
  const peakY = (x: number) => {
    for (let i = 1; i < peaks.length; i++) {
      const a = peaks[i - 1]!;
      const b = peaks[i]!;
      if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return peaks[peaks.length - 1]![1];
  };
  for (let x = 0; x < width; x += PX) {
    const y = snap(peakY(x));
    add(hills, x, y, PX, horizon - y, C.mt);
  }
  for (let x = 0; x < width; x += PX) add(hills, x, snap(peakY(x)), PX, PX, C.ridge);

  // ---- Pines along the horizon, a low tree line between them, then the ground with a few speckles. ----
  const trees: Rect[] = [];
  const pine = (x: number, base: number, size: number) => {
    for (let r = 0; r < size; r++) {
      const w = ((Math.floor(r / 2) % 3) + 1 + Math.floor(r / 3)) * 2 - 1;
      add(trees, x - (w * PX) / 2, base - (size - r) * PX, w * PX, PX, C.tree);
    }
    add(trees, x - 2, base, PX, 8, C.tree);
  };
  for (const [x, dy, size] of [[8, -4, 13], [28, 0, 10], [50, -4, 15], [74, 2, 9], [96, 0, 11], [292, 2, 10], [314, -4, 14], [338, 0, 11], [360, -4, 15], [384, 0, 10]] as const) {
    pine(sx(x), horizon + dy, size);
  }
  add(trees, sx(104), horizon - 12, sx(290) - sx(104), 16, C.tree);
  const ground: Rect[] = [];
  add(ground, 0, horizon, width, height - horizon, C.ground);
  for (let i = 0; i < 46; i++) add(ground, (i * 71 + 13) % (width - PX), horizon + 8 + ((i * 37) % Math.max(PX, height - horizon - 16)), PX, PX, C.speck);

  // ---- Firelight: three stepped ellipse rings, widest and dimmest first. ----
  const glow: Rect[] = [];
  if (night) {
    const k = rx / 136;
    const ell = (a: number, b: number, c: string, dyc = 0) => {
      for (let dy = -b; dy <= b; dy += PX) {
        const w = 2 * a * Math.sqrt(1 - (dy / b) ** 2);
        const ww = Math.round(w / 8) * 8;
        if (ww > 0) add(glow, cx - ww / 2, cy + dyc + dy, ww, PX, c);
      }
    };
    ell(snap(168 * k), 92, '#24203A');
    ell(snap(124 * k), 64, '#3A2433');
    ell(snap(76 * k), 36, '#56302A', 4);
  }

  // ---- The tent at the back left: a stepped triangle, every fourth row lit, with a door (amber at night). ----
  const tent: Rect[] = [];
  const tx = sx(50);
  const tTop = horizon - 28;
  for (let r = 0; r < 13; r++) {
    const w = 2 * r + 1;
    add(tent, tx - (w * PX) / 2, tTop + r * PX, w * PX, PX, r % 4 === 0 ? C.tentHi : C.tent);
  }
  for (let r = 6; r < 13; r++) {
    const w = 2 * (r - 6) + 1;
    add(tent, tx - (w * PX) / 2, tTop + r * PX, w * PX, PX, C.door);
  }

  // ---- The fire: two flame frames over crossed logs; by day, logs with grey ash. ----
  const logRects = cells([...Array(LOG_TOP).fill(''), ...LOGS], { L: '#7C4A26', B: '#5B341A' });
  if (!night) logRects.push({ x: 16, y: 48, w: PX, h: PX, c: '#A8A29E' }, { x: 24, y: 48, w: PX, h: PX, c: '#D6D3D1' }, { x: 20, y: 44, w: PX, h: PX, c: '#A8A29E' });

  return {
    width, height, night, horizon,
    sky: C.s1,
    ground: C.ground,
    back: [sky, stars, hills, trees, ground].flatMap(toPaths),
    glow: toPaths(glow),
    twinkles: twinkles.map(toPaths),
    front: toPaths(tent),
    labels,
    moon,
    fire,
    flameA: night ? toPaths(cells(FLAME_A, FLAME)) : [],
    flameB: night ? toPaths(cells(FLAME_B, FLAME)) : [],
    logs: toPaths(logRects),
    sparks: night ? [12, 20, 28, 16, 24].map((x, i) => ({ x, delay: i * 0.48 })) : [],
    seats,
    ring: { cx, cy, rx, ry: RY },
  };
}

/** The eight seats' slots for a screen size and top inset (the same night or day). */
export const seatBoxes = (width: number, height: number, topInset: number): Seat[] => campScene(width, height, true, topInset).seats;
/** The fire's box for a screen size and top inset. */
export const fireBox = (width: number, height: number, topInset: number): Box => campScene(width, height, true, topInset).fire;

/** Every rect a layer list draws, parsed back from its paths: for tests and the View count. */
export function pathRects(layers: readonly PathLayer[]): Rect[] {
  const out: Rect[] = [];
  for (const { c, d } of layers) {
    for (const m of d.matchAll(/M(-?\d+) (-?\d+)h(-?\d+)v(-?\d+)/g)) {
      out.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), c });
    }
  }
  return out;
}
