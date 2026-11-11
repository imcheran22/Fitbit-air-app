import { cn } from "./cn";
import { StyleSheet, View, type ViewProps } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useTheme } from "./theme";

const TILE = 7;

/**
 * The hatched track (--pattern-hatch, `repeating-linear-gradient(-45deg, ...)`): "/" stripes, 1.5 px on a
 * 5 px period, under zone rows, impact rows and stage rows. Children draw over it. Give it a height and a radius in `className`.
 */
export function Hatch({ children, className, ...props }: ViewProps) {
  const { c } = useTheme();
  const stripe = c["pattern-hatch"];
  return (
    <View className={cn("overflow-hidden", className)} {...props}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {/* The stripes are drawn diagonally inside the tile: react-native-svg on iOS ignores `patternTransform` (its
              painter builds the CGPattern from the viewBox matrix only), so a rotated tile drew vertical stripes there. A
              7 px tile keeps whole device pixels; its "/" lines are 7/√2 = 4.95 px apart, the web's 5 px period. */}
          <Pattern id="hatch" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <Path d={`M0,${TILE}L${TILE},0M${-TILE / 2},${TILE / 2}L${TILE / 2},${-TILE / 2}M${TILE / 2},${TILE * 1.5}L${TILE * 1.5},${TILE / 2}`} stroke={stripe} strokeWidth={1.5} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#hatch)" />
      </Svg>
      {children}
    </View>
  );
}
