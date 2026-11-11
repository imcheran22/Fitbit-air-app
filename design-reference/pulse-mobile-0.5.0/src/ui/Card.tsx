import { createContext, useContext } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { cn } from "./cn";
import { Gradient } from "./Gradient";
import { edge, ring as ringLayer, useShadow } from "./shadow";
import { useTheme } from "./theme";
import { RADIUS } from "./radius";

/**
 * The opaque card material (spec §2.6): 16 px corners, a top hairline (dark) or a 1 px ring and soft shadow (light).
 * The fill fades 2-4 % lighter toward the top (`card-top` to `card`) as on the web: that is <CardFill>, the first child
 * of anything wearing this class. `overflow-hidden` clips the fill to the corners.
 */
export const CARD_CLASS = "overflow-hidden rounded-2xl bg-card";

/** A row set into a card, a legend or a note (the web's rounded-lg bg-inset px-3). Add the vertical padding. */
export const INSET_ROW = "rounded-lg bg-inset px-3";

/** The flat step down from a card for a row inside one (no card in a card): rounded-lg bg-secondary. */
export const SECONDARY_ROW = "rounded-lg bg-secondary";

/** The 48 px secondary button at a card's foot ("+ Add activity", "Behaviour insights"): the web's CARD_BUTTON. */
export const CARD_BUTTON = "h-12 w-full flex-row items-center justify-center gap-2 rounded-xl bg-secondary";

/**
 * The fill of the card material: a native gradient from `card-top` to `card`, with the lit top edge (and an optional
 * inset `ring` colour: a selected or flagged card) drawn over it, since a gradient child would hide the parent's own
 * inset shadow. Put it first inside a CARD_CLASS view. Light mode draws nothing: `card-top` equals `card` there.
 */
export function CardFill({ ring }: { ring?: string }) {
  const { c, scheme } = useTheme();
  if (scheme !== "dark") return null;
  return (
    <>
      <Gradient from={c["card-top"]} to={c.card} angle="y" />
      <CardEdge ring={ring} />
    </>
  );
}

/** The card's lit top edge (and an optional inset `ring`), drawn again over a child that covers the card's own: a gradient. */
export function CardEdge({ ring }: { ring?: string }) {
  const { c } = useTheme();
  const shadow = useShadow();
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS["2xl"], boxShadow: shadow(edge(c["card-edge"]), ring && ringLayer(ring)) }} />;
}

/** True inside a <Card>: a row in a card steps down to a flat secondary row (the web's `in-data-[slot=card]:`), no card in a card. */
const InCard = createContext(false);
export const useInCard = () => useContext(InCard);

/** The card's own shadow (the web's shadow-card: the lit edge and --card-shadow), then any `extra` layers (a ring). */
export function useCardStyle(...extra: (string | false | undefined)[]): ViewStyle & { boxShadow: string } {
  const { c } = useTheme();
  const shadow = useShadow();
  return { boxShadow: shadow(edge(c["card-edge"]), "card", ...extra) };
}

/** `ring`: a 1 px ring colour (the web's `ring-1 ring-*`: an alert's red, a selected card's white) drawn inside the edge. */
export function Card({ className, style, ring, children, ...props }: ViewProps & { style?: StyleProp<ViewStyle>; ring?: string }) {
  const shadow = useCardStyle(ring && ringLayer(ring));
  return (
    <InCard.Provider value>
      <View className={cn(CARD_CLASS, "py-4", className)} style={[shadow, style]} {...props}>
        <CardFill ring={ring} />
        {children}
      </View>
    </InCard.Provider>
  );
}
