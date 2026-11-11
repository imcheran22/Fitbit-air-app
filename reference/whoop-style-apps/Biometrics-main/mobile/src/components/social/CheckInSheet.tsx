// Morning check-in (spec 2026-10-07 social §4.1): one tap, shared with every buddy, editable until midnight.

import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { saveCheckIn, type CheckInMood } from '../../api/social';
import { buddyErrorCode } from '../../api/buddies';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { CHECKIN_OPTIONS } from '../../lib/socialCopy';
import { refreshSocial } from '../../lib/socialStore';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

export function CheckInSheet({ visible, current, onClose }: { visible: boolean; current: CheckInMood | null; onClose: () => void }) {
  // The ref guards a double tap before the re-render that disables the buttons.
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(mood: CheckInMood) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await saveCheckIn(mood);
      void refreshSocial();
      onClose();
    } catch (e) {
      setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} testID="checkin-sheet">
      <View className="gap-4">
        <Text className="text-heading">How did you wake up?</Text>
        <Text testID="checkin-notice" className="text-caption text-muted-foreground">Your buddies will see this. You can change it until midnight.</Text>
        {/* A one-tap pick: today's mood is the filled button, the others are outlined. */}
        <View className="flex-row gap-2">
          {CHECKIN_OPTIONS.map((o) => (
            <Button key={o.mood} testID={`checkin-${o.mood}`} variant={current === o.mood ? 'default' : 'outline'} size="lg" accessibilityState={{ selected: current === o.mood }} disabled={busy} className="flex-1" onPress={() => void choose(o.mood)}>
              {o.label}
            </Button>
          ))}
        </View>
        {message ? <Text testID="checkin-message" className="text-caption text-destructive">{message}</Text> : null}
      </View>
    </Sheet>
  );
}
