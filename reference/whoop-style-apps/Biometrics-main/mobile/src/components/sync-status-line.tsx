import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSync } from '../sync/SyncProvider';
import { formatLastSynced } from '../sync/formatLastSynced';
import { Button } from './ui/button';

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Under the "Today" title: whether the data is current, and a tap to sync now.
// A quiet link: muted (or destructive) text rather than the link's foreground; `light` over Home's sky.
export function SyncStatusLine({ light = false }: { light?: boolean } = {}) {
  const { state, lastSyncedAt, connection, syncNow } = useSync();
  const navigation = useNavigation<any>();
  const now = useMinuteClock();
  // Over Home's sky every line reads white, on any theme: anything dimmer drops below 4.5:1 on the clear sky.
  const quiet = light ? 'text-[#FFFFFF]' : 'text-muted-foreground';
  const alarm = light ? 'text-[#FFFFFF]' : 'text-destructive';

  if (connection === 'DISCONNECTED') {
    return (
      <Button
        testID="sync-status-line"
        variant="link"
        size="xs"
        accessibilityLabel="Google Health is disconnected. Reconnect."
        onPress={() => navigation.navigate('ConnectHealth')}
        className="self-start"
        textClassName={alarm}
      >
        Google Health disconnected · Reconnect
      </Button>
    );
  }
  if (connection !== 'CONNECTED' || state === 'unknown') return null;

  if (state === 'syncing') {
    return (
      <Button
        testID="sync-status-line"
        variant="link"
        size="xs"
        accessibilityLabel="Syncing with Google Health"
        accessibilityRole="button"
        loading
        // A status, not a dead control: no 50% dim, so the line stays readable while it syncs.
        className="self-start opacity-100"
        textClassName={`${quiet} no-underline`}
      >
        Syncing with Google Health…
      </Button>
    );
  }

  const text =
    state === 'failed'
      ? "Couldn't sync · Tap to retry"
      : lastSyncedAt
        ? formatLastSynced(lastSyncedAt, now)
        : 'Not synced yet · Tap to sync';
  return (
    <Button
      testID="sync-status-line"
      variant="link"
      size="xs"
      accessibilityLabel={`${text}. Double tap to sync now.`}
      // An action (sync now), not navigation.
      accessibilityRole="button"
      onPress={() => void syncNow('manual')}
      className="self-start"
      textClassName={state === 'failed' ? alarm : quiet}
    >
      {text}
    </Button>
  );
}
