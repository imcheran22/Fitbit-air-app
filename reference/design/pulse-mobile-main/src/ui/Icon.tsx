import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "./theme";
import type { TokenName } from "./palette";

/**
 * A Lucide icon in a theme colour. The web icons take their colour from the surrounding text (currentColor);
 * React Native has no such inheritance, so the colour is named here as a token (`tone`), the same name as the
 * text-* class the web used.
 */
export function Icon({ icon: Glyph, size = 16, tone = "foreground", strokeWidth = 1.75 }: { icon: LucideIcon; size?: number; tone?: TokenName; strokeWidth?: number }) {
  const { c } = useTheme();
  return <Glyph size={size} color={c[tone]} strokeWidth={strokeWidth} />;
}
