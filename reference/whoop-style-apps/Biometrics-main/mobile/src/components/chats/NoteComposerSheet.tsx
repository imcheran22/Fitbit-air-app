import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { buddyErrorCode } from '../../api/buddies';
import { clearStatusNote, saveStatusNote, type StatusNote } from '../../api/chats';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { STATUS_NOTE_MAX, noteLength } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';
import { inputTextStyle } from '../ui/input-style';

// My Chats note (spec §8.1): up to 60 characters over my avatar for 24 hours. Share replaces it; Clear removes it.
// The note is my free text: never logged.
export function NoteComposerSheet({ visible, current, onClose, onSaved }: { visible: boolean; current: StatusNote | null; onClose: () => void; onSaved: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Start from my live note each time the sheet opens, and only then: the inbox re-reads (a foreground push, a Cheer)
  // hand a new `current` object while it is open, and that must not wipe what I am typing.
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    if (!visible) return;
    setDraft(currentRef.current?.text ?? '');
    setError(null);
  }, [visible]);
  const length = noteLength(draft);
  const run = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} testID="note-composer">
      <View className="gap-3 pb-2">
        <Text className="text-heading">Share a note</Text>
        <Text className="text-caption text-muted-foreground">Your buddies see it over your avatar in Chats for 24 hours.</Text>
        <TextInput
          testID="note-input"
          accessibilityLabel="Your note"
          value={draft}
          onChangeText={setDraft}
          placeholder="early night tonight"
          placeholderTextColor={colors.muted}
          style={inputTextStyle}
          className="h-11 rounded-xl bg-secondary px-3 text-foreground"
        />
        <Text testID="note-count" className={length > STATUS_NOTE_MAX ? 'self-end text-caption text-destructive tabular-nums' : 'self-end text-caption text-muted-foreground tabular-nums'}>{`${length}/${STATUS_NOTE_MAX}`}</Text>
        {/* Stacked full-width sheet buttons: size lg (plan ruling P4). */}
        <Button testID="note-share" size="lg" className="w-full" loading={busy} disabled={length === 0 || length > STATUS_NOTE_MAX} onPress={() => void run(() => saveStatusNote(draft))}>Share</Button>
        {current ? <Button testID="note-clear" variant="destructive" size="lg" className="w-full" disabled={busy} onPress={() => void run(clearStatusNote)}>Clear note</Button> : null}
        {error ? <Text testID="note-error" className="text-caption text-destructive">{error}</Text> : null}
      </View>
    </Sheet>
  );
}
