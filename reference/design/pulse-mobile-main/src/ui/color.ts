import type { Palette, TokenName } from "./palette";

// Colour strings are "#rrggbb" or "rgba(r, g, b, a)" (palette.ts). Skia and React Native take both.

type Rgba = [number, number, number, number];

export function parseColor(c: string): Rgba {
  if (c === "transparent") return [0, 0, 0, 0];
  if (c.startsWith("#")) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!m) throw new Error(`Unsupported colour: ${c}`);
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
}

const fmt = ([r, g, b, a]: Rgba) => (a === 1 ? `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(4)})`);

/** `color` at opacity `a` (0-1): color-mix(in srgb, color a*100%, transparent). */
export function alpha(color: string, a: number): string {
  const [r, g, b, a0] = parseColor(color);
  return fmt([r, g, b, a0 * a]);
}

/** color-mix(in srgb, a p%, b): `a` weighted p (0-1), `b` the rest. */
export function mix(a: string, b: string, p: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return fmt(x.map((v, i) => v * p + y[i] * (1 - p)) as Rgba);
}

/**
 * Turns the web's colour strings into concrete ones: `var(--token)` and the two color-mix() shapes the web kit
 * writes inline. This is what lets the ported components keep `partColor()` and `DATA_COLORS[..].css` from
 * src/lib/bands.ts, which return `var(--...)`, and still draw in Skia.
 */
export function resolveCss(value: string, palette: Palette): string {
  const token = (name: string) => {
    const v = palette[name as TokenName];
    if (!v) throw new Error(`Unknown token --${name}`);
    return v;
  };
  const v = value.trim();
  const plain = /^var\(--([a-z0-9-]+)\)$/.exec(v);
  if (plain) return token(plain[1]);
  const mixed = /^color-mix\(in (?:srgb|oklch|oklab), (var\(--[a-z0-9-]+\)|#[0-9a-f]{3,6}) (\d+(?:\.\d+)?)%, (transparent|var\(--[a-z0-9-]+\))\)$/.exec(v);
  if (mixed) {
    const a = resolveCss(mixed[1], palette);
    return mixed[3] === "transparent" ? alpha(a, Number(mixed[2]) / 100) : mix(a, resolveCss(mixed[3], palette), Number(mixed[2]) / 100);
  }
  return v;
}
