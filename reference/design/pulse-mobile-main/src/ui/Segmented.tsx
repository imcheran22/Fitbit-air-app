import { Pressable, View } from "react-native";
import { cn } from "./cn";
import { haptic } from "./haptics";
import { Text } from "./Text";

/** One segment (the web's SEGMENT_ITEM): 40 px, 8 px corners; the chosen one adds SEGMENT_ON. Add the width and padding. */
export const SEGMENT = "h-10 items-center justify-center rounded-md";
export const SEGMENT_ON = "bg-secondary";

/**
 * The W / M / 6M segmented control (web: SEGMENT_TRACK and SEGMENT_ITEM in primitives.tsx, a ToggleGroup): a muted
 * track, the chosen segment raised. `fill` stretches the segments to share the width (four ranges, or the stages tabs),
 * with the web's px-2 (Tonight's sleep). A label never breaks inside its word: where a third of a 320 px card is short of
 * it ("PERFORM"), the web's grid column grows to the word; here the word scales down a little to fit.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fill,
  label,
  textClassName = "font-numeric text-[13px] font-bold",
}: {
  value: T;
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  onChange: (v: T) => void;
  fill?: boolean;
  /** Spoken name of the control ("Range"). */
  label: string;
  textClassName?: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} className={cn("flex-row gap-0.5 rounded-lg bg-muted p-0.5", fill ? "w-full" : "shrink-0")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
            className={cn(SEGMENT, fill ? "flex-1 px-2" : "min-w-11 px-3", on && SEGMENT_ON)}
          >
            <Text className={cn(textClassName, on ? "text-foreground" : "text-muted-foreground")} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
