import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useCharacterOptional } from '../characters/CharacterContext';
import { useScreenFocused } from '../characters/useScreenFocused';
import { DEFAULT_THINKING_TEXT, THINKING_TEXT_NAMES, THINKING_TEXTS, type ThinkingTextId } from '../components/characters/thinking';
import { DEFAULT_CHARACTER_ID } from '../components/characters/types';
import { ThinkingRow } from '../components/coach/thinking/ThinkingRow';
import { SettingsGroup } from '../components/ui/settings-list';
import { Text } from '../components/ui/text';
import type { ThinkingStep } from '../lib/useCoachConversation';
import { cn } from '../lib/utils';
import { COLORS } from '../theme';

export const THINKING_TEXT_ERROR = "Your thinking text couldn't be saved. Please try again.";

// A fixed sample: the steps a sleep question goes through (spec §5).
const SAMPLE_STEPS: ReadonlyArray<Omit<ThinkingStep, 'done'>> = [
  { id: 'route', label: 'Looking at your sleep…' },
  { id: 'facts', label: 'Going through your recent nights…' },
  { id: 'write', label: 'Writing it up…' },
];
const STEP_MS = 1000;
// Each row's own preview: a fixed moment part-way through.
const ROW_STEPS: ThinkingStep[] = [
  { ...SAMPLE_STEPS[0]!, done: true },
  { ...SAMPLE_STEPS[1]!, done: false },
];

// Phase n: the first n steps are ticked and the next one is in progress; the
// last phase ticks them all, then the loop starts again.
function sampleSteps(phase: number): ThinkingStep[] {
  return SAMPLE_STEPS.slice(0, Math.min(phase + 1, SAMPLE_STEPS.length)).map((step, i) => ({ ...step, done: i < phase }));
}

// Settings -> Your coach -> Thinking text: how the chat shows a reply is on
// its way (spec §5, §9). The preview is the Coach screen's pending row, with
// the user's coach and the selected style.
export function ThinkingTextScreen() {
  const current = useCharacterOptional();
  const characterId = current?.characterId ?? DEFAULT_CHARACTER_ID;
  const selected = current?.thinkingText ?? DEFAULT_THINKING_TEXT;
  const reduceMotion = useReducedMotion();
  const focused = useScreenFocused();
  const still = reduceMotion || !focused;
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Cycle the sample steps so the steps style animates in the preview.
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setPhase((p) => (p + 1) % (SAMPLE_STEPS.length + 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [still]);
  const steps = useMemo(() => sampleSteps(phase), [phase]);

  async function choose(id: ThinkingTextId) {
    if (!current || id === selected) return;
    setError(null);
    try {
      await current.chooseThinking({ text: id });
    } catch {
      setError(THINKING_TEXT_ERROR);
      // The line appears below the list, out of VoiceOver's focus: say it too.
      AccessibilityInfo.announceForAccessibility(THINKING_TEXT_ERROR);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
        <Text className="text-caption text-muted-foreground">How the chat shows your coach is working on a reply.</Text>

        {/* Chat-like: the user's question, then the pending row under it. */}
        <View className="min-h-[150px] justify-end gap-4 rounded-card border border-border bg-card p-4">
          <View className="max-w-[80%] self-end rounded-2xl bg-muted px-3.5 py-2">
            <Text className="text-body">How did I sleep?</Text>
          </View>
          <ThinkingRow testID="thinking-preview" style={selected} characterId={characterId} steps={steps} paused={still} />
        </View>

        <SettingsGroup>
          {THINKING_TEXTS.map((id) => {
            const isSelected = id === selected;
            const { name, blurb } = THINKING_TEXT_NAMES[id];
            return (
              <Pressable
                key={id}
                testID={`thinking-text-${id}`}
                accessibilityRole="radio"
                accessibilityLabel={`${name}. ${blurb}`}
                accessibilityState={{ checked: isSelected }}
                onPress={() => void choose(id)}
                className="gap-2.5 px-4 py-3 active:bg-muted"
              >
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text className={cn('text-body', isSelected ? 'font-semibold' : '')}>{name}</Text>
                    <Text className="text-caption text-muted-foreground">{blurb}</Text>
                  </View>
                  {isSelected ? <Ionicons name="checkmark" size={18} color={colors.foreground} /> : <View className="w-[18px]" />}
                </View>
                {/* The row previews itself. Decorative for screen readers (the
                    row's label says what it is); only the selected row moves. */}
                <View
                  testID={`thinking-text-preview-${id}`}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                >
                  <ThinkingRow style={id} characterId={characterId} steps={ROW_STEPS} paused={!isSelected || still} />
                </View>
              </Pressable>
            );
          })}
        </SettingsGroup>
        {error ? (
          <Text testID="thinking-text-error" className="px-4 text-caption text-destructive">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
