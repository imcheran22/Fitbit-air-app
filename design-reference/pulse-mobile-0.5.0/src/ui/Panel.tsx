import { View, type ViewProps, type ViewStyle } from "react-native";
import { cn } from "./cn";
import type { TokenName } from "./palette";
import { ring as ringLayer, useShadow, type ShadowName } from "./shadow";
import { useTheme } from "./theme";

export type PanelLook = {
  /** The 1 px ring's colour token (`null`: none). Default `overlay-ring`, the web's ring-foreground/10. */
  ring?: TokenName | null;
  /**
   * The ring outside the edge, as the web's `ring-1` draws it (the menu). Differs from web: the dialogs and the chart
   * tooltip have always drawn it inside, and keep that (the default).
   */
  ringOutside?: boolean;
  /** The shadow token (`null`: none). Default `overlay`. */
  shadow?: ShadowName | null;
};

/**
 * The overlay material shared by menus, dialogs, tooltips and the toast: the popover fill, a ring and the overlay
 * shadow, all from tokens. The corner radius is the caller's `rounded-*` class. For a panel that must be a Pressable or
 * an Animated.View, put this style on it; otherwise use <Panel>.
 */
export function usePanelStyle({ ring = "overlay-ring", ringOutside = false, shadow = "overlay" }: PanelLook = {}): ViewStyle {
  const { c } = useTheme();
  const boxShadow = useShadow()(ring && ringLayer(c[ring], { inset: !ringOutside }), shadow);
  return { backgroundColor: c.popover, ...(boxShadow && { boxShadow }) };
}

/** A view in the overlay material (usePanelStyle). */
export function Panel({ ring, ringOutside, shadow, className, style, ...props }: ViewProps & PanelLook) {
  const look = usePanelStyle({ ring, ringOutside, shadow });
  return <View className={cn("bg-popover", className)} style={[look, style]} {...props} />;
}
