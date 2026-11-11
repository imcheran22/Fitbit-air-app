// The web's CARD_BUTTON (the 48 px secondary button at a card's foot) and TEXT_LINK (the small coach-coloured link).
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { CARD_BUTTON } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Text } from "@/ui/Text";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";

export function CardButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Press activeScale={0.96} accessibilityRole="link" onPress={() => push(href)} className={CARD_BUTTON}>
      <Text className="text-[13px] font-bold uppercase leading-4 tracking-[0.1em]">{children}</Text>
    </Press>
  );
}

/** "View trend →": the web's hit area reaches 14 px above and below. */
export function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => push(href)} hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }} className="flex-row items-center gap-1.5 self-start">
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-coach-text">{children}</Text>
      <Icon icon={ArrowRight} size={14} tone="coach-text" strokeWidth={2} />
    </Pressable>
  );
}
