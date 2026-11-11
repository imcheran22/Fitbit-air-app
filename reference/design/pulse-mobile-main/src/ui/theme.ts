import { useColorScheme } from "nativewind";
import { resolveCss } from "./color";
import { PALETTES, type Palette, type Scheme } from "./palette";

/**
 * The active theme as concrete values, for what class names cannot reach (Skia, SVG, native chrome).
 * `c` is the palette of the scheme in force (NativeWind's colour scheme: the system's, or what the kit's toggle set);
 * `css` resolves a web colour string (`var(--x)`, color-mix) against it.
 */
export function useTheme(): { scheme: Scheme; c: Palette; css: (value: string) => string } {
  const { colorScheme } = useColorScheme();
  const scheme: Scheme = colorScheme === "dark" ? "dark" : "light";
  const c = PALETTES[scheme];
  return { scheme, c, css: (value) => resolveCss(value, c) };
}
