import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachMemoryNotFoundError,
  deleteCoachMemory,
  listCoachMemory,
  type MemoryDTO,
} from '../api/coach';
import { groupMemories, MEMORY_ERROR_TEXT, PENDING_MEMORY_TEXT } from '../lib/coachMemory';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { SettingsGroup } from '../components/ui/settings-list';
import { Character } from '../components/characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';
import { MemoryEditForm } from '../components/memory-edit-form';
import { COLORS } from '../theme';
import { withAlpha } from '../lib/utils';

// One glyph per memory category, drawn in the coach's colour.
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TRAINING_GOAL: 'flag-outline',
  SCHEDULE: 'calendar-outline',
  PREFERENCE: 'options-outline',
};

type Phase = 'loading' | 'ready' | 'error' | 'unavailable';

interface MemoryRowProps {
  entry: MemoryDTO;
  icon: keyof typeof Ionicons.glyphMap;
  onChange: (entry: MemoryDTO) => void;
  onRemove: (id: string) => void;
}

function MemoryRow({ entry, icon, onChange, onRemove }: MemoryRowProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function confirmDelete() {
    if (busy) return;
    setDeleteError(false);
    setBusy(true);
    try {
      await deleteCoachMemory(entry.id);
      onRemove(entry.id);
    } catch (e) {
      if (e instanceof CoachMemoryNotFoundError) {
        onRemove(entry.id);
        return;
      }
      setDeleteError(true);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <View testID={`memory-entry-${entry.id}`} className="px-4 py-3">
        <MemoryEditForm
          id={entry.id}
          initialValue={entry.value}
          testIDPrefix="memory"
          onSaved={(saved) => {
            onChange(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onGone={() => onRemove(entry.id)}
        />
      </View>
    );
  }

  return (
    <View testID={`memory-entry-${entry.id}`} className="flex-row gap-3 px-4 py-3.5">
      <View className="h-8 w-8 items-center justify-center rounded-[10px]" style={{ backgroundColor: withAlpha(colors.coach, 0.16) }}>
        <Ionicons name={icon} size={17} color={colors.coach} />
      </View>
      <View className="flex-1 gap-1.5">
        <Text className="text-body">{entry.value}</Text>
        {entry.status === 'PENDING' ? (
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-coach" />
            <Text testID={`memory-pending-${entry.id}`} className="flex-1 text-caption text-coach">
              {PENDING_MEMORY_TEXT}
            </Text>
          </View>
        ) : null}
        {deleteError ? (
          <Text testID={`memory-error-${entry.id}`} className="text-caption text-destructive">
            {MEMORY_ERROR_TEXT.generic}
          </Text>
        ) : null}
        {confirming ? (
          <View className="mt-1 gap-2 rounded-tile bg-muted px-3 py-2.5">
            <Text className="text-body font-medium">Delete this memory?</Text>
            <View className="flex-row justify-end gap-2">
              <Button testID={`memory-cancel-delete-${entry.id}`} variant="outline" size="sm" disabled={busy} onPress={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button testID={`memory-confirm-delete-${entry.id}`} variant="destructive" size="sm" disabled={busy} onPress={() => void confirmDelete()}>
                Delete
              </Button>
            </View>
          </View>
        ) : (
          <View className="flex-row gap-5 pt-0.5">
            <Button testID={`memory-edit-${entry.id}`} variant="link" size="xs" accessibilityRole="button" onPress={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              testID={`memory-delete-${entry.id}`}
              variant="link"
              size="xs"
              accessibilityRole="button"
              textClassName="text-destructive"
              onPress={() => {
                setDeleteError(false);
                setConfirming(true);
              }}
            >
              Delete
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

// Settings -> Coach Memory: everything the coach remembers about the user,
// editable or deletable at any time (spec 6).
export function CoachMemoryScreen() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [entries, setEntries] = useState<MemoryDTO[]>([]);
  const [attempt, setAttempt] = useState(0);
  const focused = useScreenFocused();

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    (async () => {
      try {
        const loaded = await listCoachMemory();
        if (cancelled) return;
        setEntries(loaded);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setPhase(e instanceof CoachDisabledError || e instanceof CoachConsentRequiredError ? 'unavailable' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const replace = useCallback((saved: MemoryDTO) => {
    setEntries((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
  }, []);
  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  if (phase === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID="coach-memory-loading" className="gap-3 px-5 pt-4">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-20 w-full rounded-card" />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'unavailable') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID="coach-memory-unavailable" className="flex-1 items-center justify-center gap-4 px-8">
          <Character testID="coach-memory-character" mood="idle" size={48} paused={!focused} />
          <Text className="text-center text-muted-foreground">The AI Coach is not available right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Character testID="coach-memory-character" mood="idle" size={48} paused={!focused} />
          <Text testID="coach-memory-error" className="text-center text-muted-foreground">
            Your coach memory could not be loaded.
          </Text>
          <Button testID="coach-memory-retry" variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const groups = groupMemories(entries);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
        {groups.length === 0 ? (
          <Card testID="coach-memory-empty" className="items-start gap-3 p-5">
            <Character testID="coach-memory-character" mood="idle" size={40} glow paused={!focused} />
            <Text className="text-heading">Nothing remembered yet</Text>
            <Text className="text-caption text-muted-foreground">
              The coach only remembers your training goals, your schedule and your preferences, and never health or medical details.
              Anything it remembers will appear here, and you can change or delete it at any time.
            </Text>
          </Card>
        ) : (
          groups.map((group) => (
            <SettingsGroup key={group.key} label={group.label}>
              {group.entries.map((entry) => (
                <MemoryRow
                  key={entry.id}
                  entry={entry}
                  icon={CATEGORY_ICONS[group.key] ?? 'bookmark-outline'}
                  onChange={replace}
                  onRemove={remove}
                />
              ))}
            </SettingsGroup>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
