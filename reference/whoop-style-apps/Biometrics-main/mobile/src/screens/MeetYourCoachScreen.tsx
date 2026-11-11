import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View, type Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCharacter } from '../characters/CharacterContext';
import { Character } from '../components/characters/Character';
import { CoachCard } from '../components/characters/CoachCard';
import { CHARACTERS } from '../components/characters/registry';
import { CHARACTER_IDS, DEFAULT_CHARACTER_ID, type CharacterId } from '../components/characters/types';
import type { CoachStatusDTO } from '../api/coach';
import { Button } from '../components/ui/button';
import { Sheet } from '../components/ui/sheet';
import { SectionLabel } from '../components/ui/section-label';
import { Text } from '../components/ui/text';
import { useToast } from '../components/ui/toast';
import { cn } from '../lib/utils';
import type { RootStackParamList } from '../navigation/RootNavigator';

type MeetRoute = RouteProp<RootStackParamList, 'MeetYourCoach'>;
type MeetNavigation = NativeStackNavigationProp<RootStackParamList, 'MeetYourCoach'>;

const COLUMNS = 3;
const GRID_GAP = 8;
const TILE_HEIGHT = 96;
const TILE_SPRITE = 56;
// Lets the sheet slide in before the screen reader moves into it.
const FOCUS_DELAY_MS = 350;

// The grid's rows, three coaches each, in picker order.
const ROWS: CharacterId[][] = [];
for (let i = 0; i < CHARACTER_IDS.length; i += COLUMNS) ROWS.push(CHARACTER_IDS.slice(i, i + COLUMNS));

// The server's copy wins when it has any (spec §1 Registry); a missing, null
// or blank field falls back to the app's own.
function serverCopy(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function pageCopy(id: CharacterId, status: CoachStatusDTO | null) {
  const persona = status?.personas?.find((p) => p.id === id);
  return {
    tagline: serverCopy(persona?.tagline, CHARACTERS[id].tagline),
    greeting: serverCopy(persona?.greeting, CHARACTERS[id].greeting),
  };
}

// "Meet your coach" (spec §9 Picker): a 3-column grid of all 15 coaches.
// Tapping a tile selects it and raises its card in a bottom sheet with the
// coach's hello and "Choose {Name}". Only the selected tile animates; the rest
// stay paused, and the whole grid pauses while the sheet's card is up.
// 'first' opens by itself on the first Coach-tab visit, preselects Mochi and
// can be skipped (Skip saves Mochi so it never comes back); 'switch' comes
// from Profile, preselects the current coach and just closes.
export function MeetYourCoachScreen() {
  const navigation = useNavigation<MeetNavigation>();
  const route = useRoute<MeetRoute>();
  // Anything but an explicit 'first' is the harmless mode: no Skip, nothing
  // saved unless a coach is chosen.
  const mode = route.params?.mode === 'first' ? 'first' : 'switch';
  const { characterId, personaChosen, status, chooseCharacter } = useCharacter();
  const toast = useToast();
  const [selected, setSelected] = useState<CharacterId>(() =>
    mode === 'first' || !CHARACTER_IDS.includes(characterId) ? DEFAULT_CHARACTER_ID : characterId,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<RNText>(null);

  // The sheet is modal: move screen-reader focus to the card's name on open.
  useEffect(() => {
    if (!sheetOpen) return;
    const timer = setTimeout(() => {
      if (nameRef.current) AccessibilityInfo.sendAccessibilityEvent(nameRef.current, 'focus');
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sheetOpen]);

  function openCard(id: CharacterId) {
    setSelected(id);
    setError(null);
    setSheetOpen(true);
  }

  async function choose(id: CharacterId) {
    if (saving) return;
    // Nothing to save when switching to the coach you already chose. One that
    // was never chosen (the default) is saved, so the first-visit picker does
    // not come back.
    if (mode === 'switch' && personaChosen && id === characterId) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await chooseCharacter(id);
      navigation.goBack();
    } catch {
      if (mode === 'first') {
        // Closes anyway: the choice isn't saved, so the picker comes back on
        // a later Coach-tab visit rather than trapping the user here.
        toast.show("Couldn't save your coach. We'll ask again later.", 'error');
        navigation.goBack();
        return;
      }
      setError(`${CHARACTERS[id].name} couldn't be saved. Please try again.`);
      setSaving(false);
    }
  }

  const copy = pageCopy(selected, status);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <SectionLabel>Meet your coach</SectionLabel>
        {mode === 'first' ? (
          <Button testID="meet-skip" variant="ghost" size="sm" disabled={saving} onPress={() => void choose(DEFAULT_CHARACTER_ID)}>
            Skip
          </Button>
        ) : (
          <Button testID="meet-close" variant="ghost" size="sm" disabled={saving} onPress={() => navigation.goBack()}>
            Close
          </Button>
        )}
      </View>

      <ScrollView testID="meet-grid" contentContainerClassName="px-4 pb-6 pt-3" contentContainerStyle={{ gap: GRID_GAP }}>
        {ROWS.map((row) => (
          <View key={row.join('-')} className="flex-row" style={{ gap: GRID_GAP }}>
            {row.map((id) => {
              const c = CHARACTERS[id];
              const isSelected = id === selected;
              return (
                <Pressable
                  key={id}
                  testID={`meet-tile-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}, ${c.focus}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => openCard(id)}
                  style={{ height: TILE_HEIGHT }}
                  className={cn(
                    'flex-1 items-center justify-center gap-1 rounded-2xl border bg-card',
                    isSelected ? 'border-foreground' : 'border-border',
                  )}
                >
                  {/* Only the selected tile animates (spec §9 performance). */}
                  <Character characterId={id} mood="idle" size={TILE_SPRITE} paused={!isSelected || sheetOpen} attachment={null} />
                  <Text className="text-caption font-semibold" numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* A backdrop tap, Android back or a drag on the handle closes it. */}
      <Sheet testID="meet-sheet" visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View className="gap-4">
          <CoachCard
            characterId={selected}
            tagline={copy.tagline}
            greeting={copy.greeting}
            taglineTestID={`meet-tagline-${selected}`}
            greetingTestID={`meet-greeting-${selected}`}
            nameRef={nameRef}
          />
          {error ? (
            <Text testID="meet-error" className="text-center text-caption text-destructive">
              {error}
            </Text>
          ) : null}
          <Button testID="meet-choose" size="lg" disabled={saving} onPress={() => void choose(selected)}>
            {`Choose ${CHARACTERS[selected].name}`}
          </Button>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
