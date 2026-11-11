import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '../../components/ui/button';
import { PageTitle } from '../../components/ui/page-title';
import { Text } from '../../components/ui/text';
import { Character } from '../../components/characters/Character';
import { CHARACTERS } from '../../components/characters/registry';
import { THINKING_ATTACHMENT_NAMES, THINKING_ATTACHMENTS, THINKING_TEXT_NAMES, THINKING_TEXTS } from '../../components/characters/thinking';
import { CHARACTER_IDS, CHARACTER_MOODS } from '../../components/characters/types';
import { ThinkingRow } from '../../components/coach/thinking/ThinkingRow';
import type { ThinkingStep } from '../../lib/useCoachConversation';

export const LADDER_SIZES = [18, 20, 36, 40, 52, 64, 120, 180] as const;

// A sleep question part-way through: routed, now building the fact sheet.
const SAMPLE_STEPS: ThinkingStep[] = [
  { id: 'route', label: 'Looking at your sleep…', done: true },
  { id: 'facts', label: 'Going through your recent nights…', done: false },
];

// Dev-only (pixel coaches spec §9): every coach in every mood at 96 pt, the
// 9 thinking attachments on Mochi, the 10 thinking text styles, and a size
// ladder, with a background and a pause toggle. Its text takes the type scale
// but its own colours, so it reads on either background whatever the app's
// theme. Shown by launching with EXPO_PUBLIC_CHARACTER_GALLERY=1 (see App.tsx).
// Watch the perf monitor here.
export function CharacterGalleryScreen() {
  const [dark, setDark] = useState(true);
  const [paused, setPaused] = useState(false);
  const background = dark ? '#0c0c0d' : '#fafaf9';
  const foreground = dark ? '#f5f5f4' : '#1c1917';
  const ink = { color: foreground };
  // The gallery ignores the app theme, so its buttons take the gallery's own text colour.
  const buttonText = dark ? 'text-[#f5f5f4]' : 'text-[#1c1917]';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: background }} contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 28 }}>
      <PageTitle style={ink}>Character gallery</PageTitle>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Button testID="gallery-theme" variant="ghost" size="sm" textClassName={buttonText} onPress={() => setDark(!dark)}>
          {`Background: ${dark ? 'dark' : 'light'}`}
        </Button>
        <Button testID="gallery-pause" variant="ghost" size="sm" textClassName={buttonText} onPress={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </View>

      {CHARACTER_IDS.map((id) => (
        <View key={id} testID={`gallery-coach-${id}`} style={{ gap: 8 }}>
          <Text className="font-semibold" style={ink}>
            {String(CHARACTERS[id].number).padStart(2, '0')} {CHARACTERS[id].name}
          </Text>
          {/* At 96 pt the thinking stage rises 32 pt above its slot; leave room. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, paddingTop: 32 }}>
            {CHARACTER_MOODS.map((mood) => (
              <View key={mood} style={{ alignItems: 'center', gap: 4 }}>
                <Character characterId={id} mood={mood} size={96} paused={paused} />
                <Text className="text-caption" style={ink}>{mood}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View testID="gallery-attachments" style={{ gap: 8 }}>
        <Text className="text-headline" style={ink}>Thinking attachments</Text>
        {/* At 72 pt the stage rises 24 pt above the slot. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 12, rowGap: 36, paddingTop: 24 }}>
          {THINKING_ATTACHMENTS.map((attachment) => (
            <View key={attachment} style={{ alignItems: 'center', gap: 4 }}>
              <Character characterId="mochi" mood="thinking" size={72} attachment={attachment} paused={paused} />
              <Text className="text-caption" style={ink}>{THINKING_ATTACHMENT_NAMES[attachment].name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View testID="gallery-texts" style={{ gap: 16 }}>
        <Text className="text-headline" style={ink}>Thinking text</Text>
        {THINKING_TEXTS.map((style) => (
          <View key={style} style={{ gap: 6 }}>
            <Text className="text-caption" style={ink}>{THINKING_TEXT_NAMES[style].name}</Text>
            <ThinkingRow style={style} characterId="mochi" steps={SAMPLE_STEPS} paused={paused} />
          </View>
        ))}
      </View>

      <View testID="gallery-ladder" style={{ gap: 8 }}>
        <Text className="text-headline" style={ink}>Size ladder</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          {LADDER_SIZES.map((size) => (
            <View key={size} style={{ alignItems: 'center', gap: 4 }}>
              <Character characterId="mochi" mood="idle" size={size} paused={paused} />
              <Text className="text-caption" style={ink}>{size}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
