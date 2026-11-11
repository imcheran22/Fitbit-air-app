// Pixel sprite compositor (spec 2026-10-01 §2). Pure, no Skia: a SpriteDef's
// 12-column left half → a 24×24 colour grid for one eye mode. Narrow → eye
// edits → mirror → shade the body → soft outline → optional resting dim.

export const SPRITE_SIZE = 24;
const HALF = 12;
const NEVER_OUTLINED = new Set(['.', 'x', 'z', 't']);
const DIM_TOWARD = '#5B5F73';
const DIM_AMOUNT = 0.32;

export interface SpriteDef {
  half: readonly string[];
  palette: Readonly<Record<string, string>>;
  /** Letters that are eyes (default 'ew'); '' = no eyes to move (Luna). */
  eyes?: string;
  /** What an eye cell becomes when closed (default 'b'). */
  lid?: string;
  /** The closed-eye line's letter (default 'e'). */
  shut?: string;
  slim: 0 | 1 | 2;
  /** Rows to move the art down so it sits centred. */
  shift?: number;
}

export type EyeMode = 'open' | 'blink' | 'up' | 'happy' | 'shut';
export type SpriteGrid = readonly (string | null)[];

export function darkenHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0')).join('');
}

export function mixHex(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k).toString(16).padStart(2, '0')).join('');
}

/** Drop k columns, each time the one most like its outer neighbour, padding the outside. */
export function narrowHalf(half: readonly string[], k: number): string[] {
  let g = half.map((r) => [...r]);
  for (let n = 0; n < k; n++) {
    let best = -1, bestCost = Infinity;
    for (let i = 2; i <= 10; i++) {
      let cost = 0;
      for (const r of g) if (r[i] !== r[i - 1]) cost += r[i] === '.' || r[i - 1] === '.' ? 1 : 3;
      cost += Math.abs(i - 6) * 0.01;
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    g = g.map((r) => ['.', ...r.slice(0, best), ...r.slice(best + 1)]);
  }
  return g.map((r) => r.join(''));
}

function shiftDown(half: readonly string[], n: number): string[] {
  return n ? [...half.slice(-n), ...half.slice(0, -n)] : [...half];
}

function editEyes(half: string[][], def: SpriteDef, mode: EyeMode): void {
  const eyes = def.eyes ?? 'ew', lid = def.lid ?? 'b', shut = def.shut ?? 'e';
  if (!eyes || mode === 'open') return;
  const cells: [number, number, string][] = [];
  half.forEach((r, y) => r.forEach((L, x) => { if (eyes.includes(L)) cells.push([x, y, L]); }));
  if (!cells.length) return;
  if (mode === 'blink' || mode === 'shut') {
    const byCol = new Map<number, number[]>();
    for (const [x, y] of cells) byCol.set(x, [...(byCol.get(x) ?? []), y]);
    for (const [x, ys] of byCol) {
      ys.sort((a, b) => a - b);
      ys.slice(0, -1).forEach((y) => (half[y]![x] = lid));
      half[ys[ys.length - 1]!]![x] = shut;
    }
  } else if (mode === 'up') {
    cells.forEach(([x, y]) => (half[y]![x] = lid));
    cells.forEach(([x, y, L]) => { if (y > 0) half[y - 1]![x] = L; });
  } else {
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys);
    cells.forEach(([x, y]) => (half[y]![x] = lid));
    for (let x = x0; x <= x1; x++) half[y0]![x] = shut;
    if (half[y0 + 1]) {
      if (x0 > 0) half[y0 + 1]![x0 - 1] = shut;
      if (x1 < HALF - 1) half[y0 + 1]![x1 + 1] = shut;
    }
  }
}

const cache = new WeakMap<SpriteDef, Map<string, SpriteGrid>>();

export function composeSprite(def: SpriteDef, eyes: EyeMode, opts: { dim?: boolean } = {}): SpriteGrid {
  const key = `${eyes}|${opts.dim ? 1 : 0}`;
  let perDef = cache.get(def);
  if (!perDef) cache.set(def, (perDef = new Map()));
  const hit = perDef.get(key);
  if (hit) return hit;

  const N = SPRITE_SIZE;
  const half = shiftDown(narrowHalf(def.half, def.slim), def.shift ?? 0).map((r) => [...r]);
  editEyes(half, def, eyes);
  const g = half.map((r) => [...r, ...[...r].reverse()]);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !NEVER_OUTLINED.has(g[y]![x]!);
  const pal = def.palette;
  const outline = darkenHex(pal.s ?? pal.b!, 0.6);
  const out: (string | null)[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const L = g[y]![x]!;
    let col: string | null = null;
    if (L !== '.') {
      col = pal[L] ?? pal.b!;
      if (L === 'b') {
        if (!solid(x, y - 1)) col = pal.h ?? col;
        else if (!solid(x, y + 1) || !solid(x, y + 2)) col = pal.s ?? col;
      }
    } else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid(x + dx!, y + dy!))) {
      col = outline;
    }
    if (col && opts.dim && col.startsWith('#')) col = mixHex(col, DIM_TOWARD, DIM_AMOUNT);
    out.push(col);
  }
  const frozen = Object.freeze(out);
  perDef.set(key, frozen);
  return frozen;
}
