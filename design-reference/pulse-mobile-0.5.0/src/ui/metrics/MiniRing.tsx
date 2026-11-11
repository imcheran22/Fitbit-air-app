import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { DATA_COLORS, dialColor } from "@/lib/bands";
import { ringShare } from "@/lib/charts";
import { arcPath } from "../charts/geometry";
import { useTheme } from "../theme";

export type MiniRingVariant = "sleep" | "recovery" | "strain";

const MAX: Record<MiniRingVariant, number> = { sleep: 100, recovery: 100, strain: 100 };
const D = 22;
/** Every ring opens with a 4 degree gap each side of 12 o'clock: the arc runs 4 to 356 degrees clockwise. */
export const ARC_FROM = 4;
export const ARC_SWEEP = 352;

/**
 * The header's 22 px ring (ScoreDial `mini`, spec §5.1 v2): 3 px stroke, no centre text, the 4° gap at 12 o'clock.
 * `fill` false draws the track only, so a first reveal can sweep the fill in. Decorative: the link around it carries the label.
 */
export function MiniRing({ variant, value, fill = true }: { variant: MiniRingVariant; value: number | null; fill?: boolean }) {
  const { c, css } = useTheme();
  const max = MAX[variant];
  const shown = fill && value !== null ? ringShare(value, max) : 0;
  const color = value === null ? "transparent" : css(DATA_COLORS[dialColor(variant, value)].css);
  const r = D / 2 - 1.5;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="size-[22px] shrink-0">
      <Svg width={D} height={D}>
        <Path d={arcPath(D / 2, D / 2, r, ARC_FROM, ARC_FROM + ARC_SWEEP)} stroke={c["dial-track"]} strokeWidth={3} fill="none" />
        {shown > 0 && <Path d={arcPath(D / 2, D / 2, r, ARC_FROM, ARC_FROM + ARC_SWEEP * shown)} stroke={color} strokeWidth={3} fill="none" />}
      </Svg>
    </View>
  );
}
