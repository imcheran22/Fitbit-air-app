import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useCharacterOptional } from '../characters/CharacterContext';
import { useScreenFocused } from '../characters/useScreenFocused';
import { Character } from '../components/characters/Character';
import {
  DEFAULT_THINKING_ATTACHMENT,
  THINKING_ATTACHMENT_NAMES,
  THINKING_ATTACHMENTS,
  type ThinkingAttachmentId,
} from '../components/characters/thinking';
import type { CharacterMood } from '../components/characters/types';
import { Text } from '../components/ui/text';
import { cn } from '../lib/utils';

const COLUMNS = 3;
const TILE_SPRITE = 48;
// The preview loops: thinking, then the "answer's here" moment (spec §9).
const THINKING_MS = 2400;
const ANSWERING_MS = 800;
export const THINKING_STYLE_ERROR = "Your thinking style couldn't be saved. Please try again.";

const rows = Array.from({ length: Math.ceil(THINKING_ATTACHMENTS.length / COLUMNS) }, (_, i) =>
  THINKING_ATTACHMENTS.slice(i * COLUMNS, i * COLUMNS + COLUMNS),
);

// Settings -> Your coach -> Thinking style: what the coach wears while it
// works on a reply (spec §4, §9). One choice for the whole app, kept across
// coach switches. Mockup: docs/design/pixel-coaches/04-thinking-attachments.html.
export function ThinkingStyleScreen() {
  const current = useCharacterOptional();
  const selected = current?.thinkingAttachment ?? DEFAULT_THINKING_ATTACHMENT;
  const reduceMotion = useReducedMotion();
  const focused = useScreenFocused();
  const still = reduceMotion || !focused;
  const [previewMood, setPreviewMood] = useState<CharacterMood>('thinking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (still) {
      setPreviewMood('thinking');
      return;
    }
    const timer = setTimeout(
      () => setPreviewMood((mood) => (mood === 'thinking' ? 'answering' : 'thinking')),
      previewMood === 'thinking' ? THINKING_MS : ANSWERING_MS,
    );
    return () => clearTimeout(timer);
  }, [previewMood, still]);

  async function choose(id: ThinkingAttachmentId) {
    if (!current || id === selected) return;
    setError(null);
    try {
      await current.chooseThinking({ attachment: id });
    } catch {
      setError(THINKING_STYLE_ERROR);
      // The line appears below the grid, out of VoiceOver's focus: say it too.
      AccessibilityInfo.announceForAccessibility(THINKING_STYLE_ERROR);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
        <Text className="text-caption text-muted-foreground">What your coach shows while it works on a reply.</Text>

        <View className="h-[150px] items-center justify-center rounded-card border border-border bg-card">
          {/* The attachment rises above the 96 pt slot; leave it room at the top. */}
          <View className="pt-8">
            <Character testID="thinking-preview" mood={previewMood} size={96} attachment={selected} paused={still} />
          </View>
        </View>

        <View className="gap-2" accessibilityRole="radiogroup">
          {rows.map((row, r) => (
            <View key={r} className="flex-row gap-2">
              {row.map((id) => {
                const isSelected = id === selected;
                const { name } = THINKING_ATTACHMENT_NAMES[id];
                return (
                  <Pressable
                    key={id}
                    testID={`thinking-style-${id}`}
                    accessibilityRole="radio"
                    accessibilityLabel={name}
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => void choose(id)}
                    className={cn(
                      'flex-1 items-center justify-end gap-1.5 rounded-2xl border bg-card pb-2.5 pt-6 active:opacity-70',
                      isSelected ? 'border-foreground' : 'border-border',
                    )}
                  >
                    {/* Only the selected tile animates (performance). */}
                    <Character mood="thinking" size={TILE_SPRITE} attachment={id} paused={!isSelected || still} />
                    <Text className={cn('text-caption', isSelected ? 'font-semibold' : '')} numberOfLines={1}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {error ? (
          <Text testID="thinking-style-error" className="text-caption text-destructive">
            {error}
          </Text>
        ) : (
          <Text className="text-caption text-muted-foreground">{THINKING_ATTACHMENT_NAMES[selected].blurb}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
