// "Say goodnight" (spec 2026-10-07 social §6.1), on the Campfire page and under the evening timeline. Once said:
// "Goodnight said" (", on time" when it was), with Undo until the server's `undoUntil` — the button disappears by
// itself when it passes. `onChanged` re-reads whatever shows the goodnight. A refusal shows the server's reason in words.
// What the server answered to a say or an undo is kept here until the `goodnight` prop changes, so the button is right
// even if that re-read fails. The Campfire's `camp` look is a larger indigo button with a moon,
// on the Campfire's always-dark glass.

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buddyErrorCode } from '../../api/buddies';
import { sayGoodnight, undoGoodnight, type Goodnight } from '../../api/social';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { goodnightSaidLine } from '../../lib/socialCopy';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';

export function GoodnightButton({ goodnight: fromProps, onChanged, testID = 'goodnight', look = 'default' }: {
  goodnight: Goodnight | null; onChanged: () => void; testID?: string; look?: 'default' | 'camp';
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The server's answer to my last say (its goodnight) or undo (null); undefined = none, so the prop shows.
  const [answered, setAnswered] = useState<Goodnight | null | undefined>(undefined);
  // Bumped when the undo window closes, only to re-render; the check below reads the clock itself, so a goodnight
  // that arrives after mount (said, or refreshed) is never judged against a stale time.
  const [, setTick] = useState(0);
  // `busy` disables the button only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A new goodnight from the parent (a re-read) replaces my local answer and any old message.
  useEffect(() => {
    setAnswered(undefined);
    setMessage(null);
  }, [fromProps]);

  const goodnight = answered === undefined ? fromProps : answered;
  // The server's deadline (capped at the next 06:00), never computed from `at`; an unreadable one offers no Undo.
  const parsed = goodnight ? Date.parse(goodnight.undoUntil) : NaN;
  const undoUntil = Number.isNaN(parsed) ? 0 : parsed;
  // Re-render when the undo window closes, so Undo goes away by itself.
  useEffect(() => {
    const left = undoUntil - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setTick((t) => t + 1), left + 1);
    return () => clearTimeout(timer);
  }, [undoUntil]);

  async function run(action: () => Promise<Goodnight | null>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (mounted.current) setAnswered(result);
      onChanged();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      {goodnight ? (
        <View className="flex-row items-center justify-between gap-2">
          <Text testID={`${testID}-said`} className="text-body font-semibold">{goodnightSaidLine(goodnight)}</Text>
          {undoUntil > Date.now() ? (
            <Button testID={`${testID}-undo`} accessibilityLabel="Undo goodnight" variant="secondary" size="sm" disabled={busy}
              onPress={() => void run(async () => {
                await undoGoodnight();
                return null;
              })}>
              Undo
            </Button>
          ) : null}
        </View>
      ) : (
        look === 'camp' ? (
          <Button testID={`${testID}-say`} size="lg" disabled={busy} onPress={() => void run(async () => (await sayGoodnight()).goodnight)}
            className="border-[#A5B4FC]/35 bg-[#6366F1]/25 active:bg-[#6366F1]/35" textClassName="text-[#E0E7FF]"
            iconStart={<Ionicons name="moon" size={buttonIconSize('lg')} color="#E0E7FF" />}>
            Say goodnight
          </Button>
        ) : (
          <Button testID={`${testID}-say`} disabled={busy} onPress={() => void run(async () => (await sayGoodnight()).goodnight)}>Say goodnight</Button>
        )
      )}
      {message ? <Text testID={`${testID}-message`} accessibilityLiveRegion="polite" className="text-caption text-destructive">{message}</Text> : null}
    </View>
  );
}
