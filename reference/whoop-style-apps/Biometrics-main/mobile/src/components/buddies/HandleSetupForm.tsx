import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { buddyErrorCode, saveIdentity, type BuddyIdentity } from '../../api/buddies';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { TextField } from '../ui/text-field';

// What the server compares against (backend identity.ts): a handle trimmed, one leading @ dropped,
// lowercased; a display name trimmed. Only for deciding what changed; the raw text is what is sent.
const sameHandle = (input: string, saved: string | null) => {
  const trimmed = input.trim();
  return (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toLowerCase() === saved;
};
const sameName = (input: string, saved: string | null) => input.trim() === saved;

// The @handle and display name (spec 2026-10-06 buddies §2). The server validates and normalises
// (one leading @, lowercase); this form shows its reason when it refuses. onSaved's `changed` is
// false when an edit had nothing to save (nothing was sent).
export function HandleSetupForm({
  identity, mode, onSaved,
}: { identity: BuddyIdentity; mode: 'setup' | 'edit'; onSaved: (next: BuddyIdentity, changed: boolean) => void }) {
  const [handle, setHandle] = useState(identity.handle ?? '');
  const [name, setName] = useState(identity.displayName ?? identity.displayNamePrefill);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` disables the button only after a re-render; a double tap in one frame saves once.
  const saving = useRef(false);

  async function save() {
    if (saving.current) return;
    const patch: { handle?: string; displayName?: string } = {};
    if (mode === 'setup' || !sameHandle(handle, identity.handle)) patch.handle = handle;
    if (mode === 'setup' || !sameName(name, identity.displayName)) patch.displayName = name;
    if (Object.keys(patch).length === 0) {
      onSaved(identity, false);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveIdentity(patch), true);
    } catch (e) {
      setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <View testID="handle-setup" className="gap-4">
      <Text className="text-display">{mode === 'setup' ? 'Pick your buddy name' : 'Your buddy name'}</Text>
      <Text className="text-caption text-muted-foreground">Friends find you by your exact @handle. Your email is never shown.</Text>
      <TextField label="Handle" testID="handle-input" value={handle} onChangeText={setHandle} autoCapitalize="none" />
      <TextField label="Display name" testID="display-name-input" value={name} onChangeText={setName} />
      {error ? <Text testID="handle-setup-error" className="text-caption text-destructive">{error}</Text> : null}
      <Button testID="handle-setup-save" size="lg" disabled={busy || !handle.trim() || !name.trim()} onPress={() => void save()}>
        {mode === 'setup' ? 'Continue' : 'Save'}
      </Button>
    </View>
  );
}
