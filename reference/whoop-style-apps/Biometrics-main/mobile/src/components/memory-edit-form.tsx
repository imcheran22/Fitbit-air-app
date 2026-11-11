import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useColorScheme } from 'nativewind';
import { CoachMemoryNotFoundError, CoachMemoryValidationError, updateCoachMemory, type MemoryDTO } from '../api/coach';
import { MEMORY_ERROR_TEXT, MEMORY_MAX_LENGTH, validateMemoryText } from '../lib/coachMemory';
import { COLORS } from '../theme';
import { Text } from './ui/text';
import { inputTextStyle } from './ui/input-style';
import { Button } from './ui/button';

interface MemoryEditFormProps {
  id: string;
  initialValue: string;
  // Test ids are `${testIDPrefix}-input-${id}` etc.; the prefix keeps the
  // Coach Memory screen and the chat chip distinguishable.
  testIDPrefix: string;
  onSaved: (entry: MemoryDTO) => void;
  onCancel: () => void;
  // The entry no longer exists on the server.
  onGone: () => void;
}

// Inline editor for one memory entry, shared by the Coach Memory screen and the
// "I'll remember" line in chat so both go through the same rules and the same
// update call.
export function MemoryEditForm({ id, initialValue, testIDPrefix, onSaved, onCancel, onGone }: MemoryEditFormProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const problem = validateMemoryText(value);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onSaved(await updateCoachMemory(id, value.trim()));
    } catch (e) {
      if (e instanceof CoachMemoryNotFoundError) {
        onGone();
        return;
      }
      setError(e instanceof CoachMemoryValidationError ? MEMORY_ERROR_TEXT.rejected : MEMORY_ERROR_TEXT.generic);
      setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      <TextInput
        testID={`${testIDPrefix}-input-${id}`}
        value={value}
        onChangeText={setValue}
        maxLength={MEMORY_MAX_LENGTH}
        multiline
        autoFocus
        editable={!busy}
        placeholderTextColor={colors.muted}
        style={[inputTextStyle, { color: colors.foreground, minHeight: 64, textAlignVertical: 'top' }]}
        className="rounded-tile border border-border bg-background px-3.5 py-3"
      />
      <Text
        testID={`${testIDPrefix}-counter-${id}`}
        className="self-end text-caption text-muted-foreground tabular-nums"
      >
        {`${value.length}/${MEMORY_MAX_LENGTH}`}
      </Text>
      {error ? (
        <Text testID={`${testIDPrefix}-error-${id}`} className="text-caption text-destructive">
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-center justify-end gap-2">
        <Button testID={`${testIDPrefix}-cancel-${id}`} variant="outline" size="sm" disabled={busy} onPress={onCancel}>
          Cancel
        </Button>
        <Button testID={`${testIDPrefix}-save-${id}`} size="sm" disabled={busy} onPress={() => void save()}>
          Save
        </Button>
      </View>
    </View>
  );
}
