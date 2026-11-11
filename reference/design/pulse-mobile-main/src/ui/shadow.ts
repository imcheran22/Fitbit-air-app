import { VALUES, type Scheme } from "./palette";
import { useTheme } from "./theme";

/** A shadow token of global.css, `--<name>-shadow`. */
export type ShadowName = "card" | "overlay" | "thumb" | "glass" | "lifted" | "toast";
type Layer = ShadowName | string | false | null | undefined;

/** A `width` px ring in `color`: inside the edge (the default), or outside it like the web's `ring-1`. */
export const ring = (color: string, { width = 1, inset = true }: { width?: number; inset?: boolean } = {}) => `${inset ? "inset " : ""}0 0 0 ${width}px ${color}`;

/** The lit top edge of the card and glass materials (the web's `inset 0 1px 0 var(--card-edge)`). */
export const edge = (color: string) => `inset 0 1px 0 ${color}`;

// A layer that draws nothing: the web's "no shadow" (0 0 #0000), or one whose colour is fully transparent.
const invisible = (layer: string) => layer === "0 0 #0000" || /rgba\([^)]*,\s*0\)$/.test(layer);

/**
 * One React Native `boxShadow` from shadow tokens (by name: "card", "overlay" ...) and literal layers (`ring`, `edge`),
 * in that order. Layers that draw nothing are left out, so the light card is its shadow alone and the dark card its edge.
 */
export function boxShadow(scheme: Scheme, ...layers: Layer[]): string {
  const values: Record<string, string | number> = VALUES[scheme];
  return layers
    .filter((l): l is string => !!l)
    .map((l) => String(values[`${l}-shadow`] ?? l))
    .filter((l) => !invisible(l))
    .join(", ");
}

/** `boxShadow` for the scheme in force. */
export function useShadow() {
  const { scheme } = useTheme();
  return (...layers: Layer[]) => boxShadow(scheme, ...layers);
}
