// "Share with buddies" (spec 2026-10-07 social §4.2; plan ruling): an explicit, undoable share of this recap's
// headline line to today's story. The line can hold the user's own numbers, so sharing first previews it exactly
// ("Your buddies will see: …"); Share is consent for that line, and nothing is shared without it. The previewed line
// is sent with the share, so the server refuses it if the recap's line changed in between. Hidden until the
// user has a buddy, for a recap without a line, on a server without recap shares, and until the server's shared
// state is known (a failed lookup keeps it hidden: never a guessed "not shared").

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { buddyErrorCode } from '../../api/buddies';
import { fetchRecapShared, shareRecap, unshareRecap } from '../../api/social';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { useBuddies } from '../../lib/buddiesStore';
import { refreshSocial } from '../../lib/socialStore';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

export function ShareWithBuddiesButton({ recapId, line }: { recapId: string; line: string }) {
  const buddies = useBuddies();
  const busy = useRef(false);
  const mounted = useRef(true);
  // null = not known (loading, failed, or an older server): the button stays hidden.
  const [shared, setShared] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setShared(null);
    fetchRecapShared(recapId).then(
      (s) => {
        if (live) setShared(s);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [recapId]);

  const previewed = line.trim();
  if (buddies.status !== 'ready' || buddies.page.buddies.length === 0 || !previewed || shared === null) return null;

  function openSheet() {
    setMessage(null);
    setConfirming(true);
  }

  async function run(fn: () => Promise<unknown>, next: boolean) {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    try {
      await fn();
      if (mounted.current) setShared(next);
      void refreshSocial();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      busy.current = false;
      if (mounted.current) setConfirming(false);
    }
  }

  return (
    <View className="gap-1">
      <Button
        testID="recap-share-buddies"
        variant="outline"
        onPress={() => (shared ? void run(() => unshareRecap(recapId), false) : openSheet())}
      >
        {shared ? 'Shared with buddies · Undo' : 'Share with buddies'}
      </Button>
      {message ? <Text testID="recap-share-buddies-message" className="text-caption text-destructive">{message}</Text> : null}
      <Sheet visible={confirming} onClose={() => setConfirming(false)} testID="recap-share-buddies-sheet">
        <View className="gap-4">
          <Text className="text-heading">Share with buddies?</Text>
          <Text testID="recap-share-buddies-preview" className="text-body">{`Your buddies will see: ${previewed}`}</Text>
          <Text className="text-caption text-muted-foreground">It shows in today's story with this recap's dates — none of its other numbers. You can undo it.</Text>
          <View className="flex-row gap-2">
            <Button testID="recap-share-buddies-cancel" variant="outline" className="flex-1" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button testID="recap-share-buddies-confirm" className="flex-1" onPress={() => void run(() => shareRecap(recapId, previewed), true)}>
              Share
            </Button>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
