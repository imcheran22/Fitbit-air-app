import type { ReactNode } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { alpha, mix, parseColor } from "./color";
import { Gradient } from "./Gradient";
import { edge, ring, useShadow } from "./shadow";
import { useTheme } from "./theme";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** A translucent colour as it shows over `under`: the same colour, opaque. */
const over = (color: string, under: string) => {
  const [r, g, b, a] = parseColor(color);
  return mix(`rgb(${r}, ${g}, ${b})`, under, a);
};

/**
 * Glass material (spec §2.6), for chrome that floats over scrolling content: the tab bar and the round action. iOS blurs
 * what is behind it (UIVisualEffectView) under the sampled translucent gradient fill. Android draws the fill opaque, as it
 * shows over the page's background: a RenderNode blur re-blurs the scrolling page every frame, about 4 ms of GPU time
 * per frame, which keeps a 120 Hz screen from scrolling at 120 fps. Both have the lit top edge, a faint rim and a soft
 * lower shadow.
 */
export function Glass({ radius, action, children, style, ...props }: ViewProps & { radius: number; /** The indigo-tinted fill of the round action. */ action?: boolean; children?: ReactNode }) {
  const { c, scheme } = useTheme();
  const shadow = useShadow();
  const rim = action ? alpha(c["action-rim-from"], 0.25) : c["glass-rim"];
  const fill = (color: string) => (Platform.OS === "ios" ? color : over(color, c.background));
  return (
    <View style={[{ borderRadius: radius, boxShadow: shadow("glass") }, style]} {...props}>
      <View style={{ ...FILL, borderRadius: radius, overflow: "hidden" }}>
        {Platform.OS === "ios" && <BlurView intensity={50} tint={scheme} style={FILL} />}
        <Gradient from={fill(action ? c["glass-action-top"] : c["glass-top"])} to={fill(action ? c["glass-action-bottom"] : c["glass-bottom"])} angle="y" />
      </View>
      {/* The lit top edge and the faint rim, over the fill. */}
      <View pointerEvents="none" style={{ ...FILL, borderRadius: radius, boxShadow: shadow(edge(c["glass-edge"]), ring(rim)) }} />
      {children}
    </View>
  );
}
