import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { CoachMemoryNotFoundError, deleteCoachMemory, type MemoryDTO } from '../api/coach';
import { MEMORY_ERROR_TEXT } from '../lib/coachMemory';
import { COLORS } from '../theme';
import { Text } from './ui/text';
import { Button } from './ui/button';
import { MemoryEditForm } from './memory-edit-form';

function MemoryProposalChip({ proposal }: { proposal: MemoryDTO }) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [value, setValue] = useState(proposal.value);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoError, setUndoError] = useState(false);

  if (gone) return null;

  async function undo() {
    if (busy) return;
    setUndoError(false);
    setBusy(true);
    try {
      await deleteCoachMemory(proposal.id);
      setGone(true);
    } catch (e) {
      // Already deleted elsewhere is the outcome the user asked for.
      if (e instanceof CoachMemoryNotFoundError) setGone(true);
      else {
        setUndoError(true);
        setBusy(false);
      }
    }
  }

  if (editing) {
    return (
      <View className="max-w-[90%]">
        <MemoryEditForm
          id={proposal.id}
          initialValue={value}
          testIDPrefix="memory-chip"
          onSaved={(entry) => {
            setValue(entry.value);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onGone={() => setGone(true)}
        />
      </View>
    );
  }

  return (
    <View className="max-w-[90%] gap-2 rounded-tile border border-coach/25 bg-coach/10 px-3.5 py-3">
      <View className="flex-row items-start gap-2">
        <Ionicons name="bulb-outline" size={15} color={colors.coach} style={{ marginTop: 1 }} />
        <Text testID={`memory-chip-${proposal.id}`} className="shrink text-body">
          {`I'll remember: ${value}`}
        </Text>
      </View>
      <View className="flex-row gap-4 pl-6">
        <Button testID={`memory-chip-edit-${proposal.id}`} variant="link" size="xs" accessibilityRole="button" onPress={() => setEditing(true)}>
          Edit
        </Button>
        <Button testID={`memory-chip-undo-${proposal.id}`} variant="link" size="xs" accessibilityRole="button" disabled={busy} onPress={() => void undo()}>
          Undo
        </Button>
      </View>
      {undoError ? (
        <Text testID={`memory-chip-error-${proposal.id}`} className="pl-6 text-caption text-destructive">
          {MEMORY_ERROR_TEXT.generic}
        </Text>
      ) : null}
    </View>
  );
}

// A card under a coach reply for each memory the coach proposed that turn, in
// the coach's own colour, so the user always sees what is being remembered and
// can correct or undo it.
export function MemoryProposalChips({ proposals }: { proposals: MemoryDTO[] }) {
  if (proposals.length === 0) return null;
  return (
    <View className="gap-2">
      {proposals.map((proposal) => (
        <MemoryProposalChip key={proposal.id} proposal={proposal} />
      ))}
    </View>
  );
}
