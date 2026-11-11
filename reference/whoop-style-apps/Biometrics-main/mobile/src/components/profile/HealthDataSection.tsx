import React, { useContext } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useSync } from '../../sync/SyncProvider';
import { formatLastSynced } from '../../sync/formatLastSynced';
import { COLORS } from '../../theme';
import { SettingsGroup, SettingsRow } from '../ui/settings-list';

// Profile → Health data. Connecting is a task reachable from a tab, not a gate in front of the
// app: signing in lands on the dashboard whatever the status is.
export function HealthDataSection() {
  const navigation = useContext(NavigationContext);
  const { state: syncState, lastSyncedAt, connection, syncNow } = useSync();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const connected = connection === 'CONNECTED';
  return (
    <SettingsGroup label="Health data">
      <SettingsRow
        testID="connect-health-row"
        icon="heart"
        tint={colors.metricHeart}
        title="Google Health"
        subtitle="Sync steps, sleep, heart rate and HRV"
        value={connected ? 'Connected' : 'Connect'}
        onPress={() => navigation?.navigate('ConnectHealth' as never)}
      />
      {connected ? (
        <SettingsRow
          testID="settings-sync-now"
          icon="sync-outline"
          title={syncState === 'syncing' ? 'Syncing…' : 'Sync now'}
          subtitle={lastSyncedAt ? formatLastSynced(lastSyncedAt, new Date(), 'Last synced') : 'Not synced yet'}
          subtitleTestID="settings-last-synced"
          disabled={syncState === 'syncing'}
          onPress={() => void syncNow('manual')}
        />
      ) : null}
    </SettingsGroup>
  );
}
