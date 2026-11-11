// The coach's answer text, ported from pulse src/app/(app)/coach/Prose.tsx (via halo): paragraphs, bullet and numbered
// lists, **bold**. Built from parsed strings into Text, so model output is never interpreted as markup. Selectable, so
// a long press copies it.
import { useMemo } from "react";
import { View } from "react-native";
import { parseProse, type Span } from "@/coach/prose";
import { Text } from "@/ui/Text";

const BODY = "text-[15px] leading-6 text-foreground";

const Spans = ({ spans }: { spans: Span[] }) => (
  <>
    {spans.map((s, i) =>
      s.bold ? (
        <Text key={i} className={`${BODY} font-semibold`}>
          {s.text}
        </Text>
      ) : (
        s.text
      ),
    )}
  </>
);

/** `space-y-3 text-[15px] leading-6`; lists `space-y-1.5`, faint markers. */
export function Prose({ text }: { text: string }) {
  const blocks = useMemo(() => parseProse(text), [text]);
  return (
    <View className="gap-3">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <Text key={i} selectable className={BODY}>
            <Spans spans={b.spans} />
          </Text>
        ) : (
          <View key={i} className="gap-1.5">
            {b.items.map((item, k) => (
              <View key={k} className="flex-row">
                <Text className={b.kind === "ul" ? "w-5 text-[15px] leading-6 text-muted-foreground" : "w-6 font-numeric text-[15px] font-semibold leading-6 text-muted-foreground"}>{b.kind === "ul" ? "•" : `${k + 1}.`}</Text>
                <Text selectable className={`${BODY} flex-1`}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
