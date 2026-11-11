// Deterministic simulation helpers: a seeded PRNG so a failing statistical test
// reproduces exactly, never a Math.random() flake.

/** mulberry32: small, fast, good enough for test data. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** AR(1) series with unit variance: x_t = phi * x_{t-1} + noise. */
export function ar1(rand: () => number, n: number, phi: number): number[] {
  const out: number[] = [];
  let prev = gaussian(rand);
  for (let i = 0; i < n; i++) {
    prev = phi * prev + Math.sqrt(1 - phi * phi) * gaussian(rand);
    out.push(prev);
  }
  return out;
}

/** Sticky 0/1 Markov chain: keeps its state with probability `stay`, else redraws. */
export function stickyBinary(rand: () => number, n: number, stay: number, pOne = 0.5): number[] {
  const out: number[] = [];
  let state = rand() < pOne ? 1 : 0;
  for (let i = 0; i < n; i++) {
    if (rand() >= stay) state = rand() < pOne ? 1 : 0;
    out.push(state);
  }
  return out;
}

const DAY_MS = 86_400_000;
export function dateAt(start: string, offset: number): string {
  return new Date(new Date(`${start}T00:00:00Z`).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}
