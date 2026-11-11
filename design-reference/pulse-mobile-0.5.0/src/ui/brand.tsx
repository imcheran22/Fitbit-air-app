import Svg, { Path, Rect } from "react-native-svg";
import type { TokenName } from "./palette";
import { useTheme } from "./theme";

// Ported from pulse src/components/brand (docs/design/brand.md). Same geometry; colour is a token name, since there is
// no currentColor to inherit.

/**
 * The Pulse wordmark. The glyphs are monoline strokes on a 20-unit cap height. The L's foot runs on as a heartbeat
 * (one spike up, one dip below the baseline) and becomes the S's bottom bar, so L, beat and S are a single stroke.
 * bold: for the in-app header, about 14 to 18 px cap height. black: for a splash, 32 px and up.
 */
const CAP = 20;
const STROKE = { bold: 3.2, black: 4.4 } as const;

function build(s: number) {
  const h = s / 2;
  const r = 5; // corner radius on the centreline (P bowl, U)
  const gap = 5.5;
  const base = CAP - h; // centreline of strokes that sit on the baseline
  const d: string[] = [];

  // P: square top-left corner; the bowl closes at 60% of the cap height.
  const yb = 11.5 + h;
  d.push(`M${h} ${CAP}V${h}H${19 - h - r}A${r} ${r} 0 0 1 ${19 - h} ${h + r}V${yb - r}A${r} ${r} 0 0 1 ${19 - h - r} ${yb}H${h}`);
  let x = 19 + gap;

  // U
  d.push(`M${x + h} 0V${base - r}A${r} ${r} 0 0 0 ${x + h + r} ${base}H${x + 20 - h - r}A${r} ${r} 0 0 0 ${x + 20 - h} ${base - r}V0`);
  x += 20 + gap;

  // L, beat and S as one stroke. The beat scales with the weight so its counter stays open.
  const k = 0.8 * s + 1.3; // half-width of the spike
  const rise = 7.5; // spike height above the baseline
  const dip = 2.5; // dip below the baseline
  const b = x + 12; // the beat starts where a plain L's foot would end
  const sx = b + 2.5 * k - 1; // the S's left edge
  const sw = 21;
  const rs = Math.min(r, (CAP / 2 - h) / 2); // the S needs two radii in each half
  const ym = CAP / 2;
  d.push(
    `M${x + h} 0V${base}H${b}L${b + k} ${base - rise}L${b + 2 * k} ${base + dip}L${b + 2.5 * k} ${base}` +
      `H${sx + sw - h - rs}A${rs} ${rs} 0 0 0 ${sx + sw - h} ${base - rs}V${ym + rs}A${rs} ${rs} 0 0 0 ${sx + sw - h - rs} ${ym}` +
      `H${sx + h + rs}A${rs} ${rs} 0 0 1 ${sx + h} ${ym - rs}V${h + rs}A${rs} ${rs} 0 0 1 ${sx + h + rs} ${h}H${sx + sw}`,
  );
  x = sx + sw + gap;

  // E: the middle arm is 2 units short.
  d.push(`M${x + 17} ${h}H${x + h}V${base}H${x + 17}M${x + h} ${ym}H${x + 15}`);
  const width = x + 17;

  // The dip's miter tip hangs below the baseline: tip = vertex + h / sin(half the join angle).
  const ux = -k, uy = -(rise + dip), vx = 0.5 * k, vy = -dip;
  const angle = Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)));
  const bottom = base + dip + h / Math.sin(angle / 2);

  return { d: d.join(""), width: +width.toFixed(2), height: +bottom.toFixed(2) };
}

const GLYPHS = { bold: build(STROKE.bold), black: build(STROKE.black) };

/** `height` in px (the cap-height box); the width follows the glyphs' aspect ratio. */
export function Wordmark({ height = 16, weight = "bold", tone = "foreground" }: { height?: number; weight?: keyof typeof STROKE; tone?: TokenName }) {
  const { c } = useTheme();
  const { d, width, height: h } = GLYPHS[weight];
  return (
    <Svg viewBox={`0 0 ${width} ${h}`} width={(height * width) / h} height={height} accessibilityLabel="Pulse">
      <Path d={d} fill="none" stroke={c[tone]} strokeWidth={STROKE[weight]} strokeMiterlimit={8} />
    </Svg>
  );
}

/** The Pulse mark, option 4g "Cool pair": two staggered beats, lub then dub. brand: optimal teal, then strain blue; mono: one token colour. */
export function Mark({ size = 24, color = "brand", tone = "foreground" }: { size?: number; color?: "brand" | "mono"; tone?: TokenName }) {
  const { c } = useTheme();
  const mono = color === "mono";
  return (
    <Svg viewBox="4.5 4.5 15 15" width={size} height={size} accessibilityLabel="Pulse">
      <Rect x={6.9} y={4.5} width={4.2} height={11} rx={2.1} fill={mono ? c[tone] : c.optimal} />
      <Rect x={12.9} y={8.5} width={4.2} height={11} rx={2.1} fill={mono ? c[tone] : c["strain-text"]} />
    </Svg>
  );
}

/**
 * The band in the reference app's battery slot (pulse src/components/brand/BandIcon.tsx): the outer edge with its notch,
 * the front strap's edge, the back strap's inner edge and the clasp, on the 24-unit grid.
 */
export function BandIcon({ size = 24, strokeWidth = 1.5, color }: { size?: number; strokeWidth?: number; color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {BAND_PATHS.map((d) => (
        <Path key={d.slice(0, 12)} d={d} />
      ))}
    </Svg>
  );
}

const BAND_PATHS = [
  "M9.38 2.43C9.74 2.16 9.84 2.13 10.30 2.06C10.77 1.99 11.54 2.01 12.15 2.00C12.77 1.99 13.39 1.98 14.01 2.00C14.62 2.02 15.40 2.08 15.86 2.12C16.32 2.16 16.51 2.14 16.78 2.25C17.06 2.35 17.34 2.45 17.52 2.74C17.71 3.03 17.77 3.36 17.90 3.98C18.02 4.59 18.16 5.67 18.27 6.44C18.37 7.22 18.46 7.88 18.51 8.60C18.56 9.33 18.57 10.05 18.57 10.77C18.57 11.49 18.54 12.31 18.51 12.93C18.48 13.54 18.45 13.95 18.39 14.47C18.33 14.98 18.23 15.52 18.14 16.01C18.05 16.51 17.97 16.95 17.83 17.43C17.70 17.92 17.53 18.46 17.34 18.91C17.14 19.37 16.90 19.78 16.66 20.15C16.42 20.52 16.24 20.86 15.92 21.14C15.60 21.41 15.22 21.67 14.75 21.81C14.27 21.96 13.67 21.98 13.08 22.00C12.49 22.02 11.85 21.97 11.23 21.94C10.61 21.91 9.91 21.93 9.38 21.81C8.84 21.70 8.39 21.50 8.02 21.26C7.65 21.02 7.39 20.72 7.15 20.40C6.92 20.07 6.74 19.65 6.60 19.28C6.45 18.91 6.36 18.49 6.29 18.17C6.22 17.85 6.23 17.60 6.17 17.37C6.10 17.14 6.02 16.97 5.92 16.81C5.82 16.66 5.63 16.68 5.55 16.44C5.47 16.21 5.44 15.88 5.43 15.40C5.42 14.91 5.45 14.11 5.49 13.54C5.53 12.98 5.60 12.51 5.67 12.00C5.74 11.49 5.83 10.97 5.92 10.46C6.01 9.94 6.10 9.46 6.23 8.91C6.35 8.37 6.49 7.78 6.66 7.19C6.84 6.59 7.03 5.92 7.28 5.33C7.52 4.75 7.79 4.15 8.14 3.67C8.49 3.18 9.02 2.70 9.38 2.43Z",
  "M14.93 2.25C14.84 2.41 14.58 2.86 14.38 3.23C14.17 3.60 13.90 3.99 13.70 4.47C13.49 4.95 13.31 5.55 13.14 6.14C12.98 6.72 12.83 7.37 12.71 7.99C12.59 8.60 12.49 9.22 12.40 9.84C12.31 10.46 12.23 11.07 12.15 11.69C12.08 12.31 12.01 12.93 11.97 13.54C11.93 14.16 11.93 14.88 11.91 15.40C11.89 15.91 11.88 16.27 11.85 16.63C11.81 16.99 11.74 17.40 11.72 17.56",
  "M11.91 19.10C11.97 19.27 12.14 19.81 12.28 20.15C12.41 20.49 12.60 20.84 12.71 21.14C12.82 21.43 12.92 21.80 12.96 21.94",
  "M16.91 3.23C17.01 3.62 17.38 4.67 17.52 5.52C17.67 6.36 17.73 7.32 17.77 8.30C17.81 9.27 17.79 10.41 17.77 11.38C17.75 12.36 17.72 13.29 17.65 14.16C17.58 15.03 17.47 15.88 17.34 16.63C17.21 17.38 17.05 18.05 16.85 18.67C16.64 19.28 16.37 19.87 16.10 20.33C15.84 20.80 15.38 21.26 15.24 21.44",
  "M7.40 14.28C7.90 14.28 9.87 14.28 10.36 14.28",
];
