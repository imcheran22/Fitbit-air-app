import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { clearTimezoneOverride, getTimezoneState, listTimeZones, setTimezoneOverride, type TimezoneState } from '../../lib/timezone';
import { useTabBarClearance } from '../../navigation/tabBarLayout';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { inputTextStyle } from '../ui/input-style';
import { SettingsGroup, SettingsRow } from '../ui/settings-list';
import { Text } from '../ui/text';

const MAX_RESULTS = 60;

// Profile → Time zone: the zone in use, a searchable picker to override it, and the way back to
// the device's zone. The picker fills the screen, so this section is never inside a ScrollView.
export function TimezoneSection() {
  const clearance = useTabBarClearance();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [state, setState] = useState<TimezoneState | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTimezoneState().then(setState).catch(() => setState(null));
  }, []);

  const zones = useMemo(() => (picking ? listTimeZones() : []), [picking]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/ /g, '_');
    const filtered = needle ? zones.filter((z) => z.toLowerCase().includes(needle)) : zones;
    return filtered.slice(0, MAX_RESULTS);
  }, [zones, query]);

  async function choose(zone: string) {
    setError(null);
    try {
      await setTimezoneOverride(zone);
      setState(await getTimezoneState());
      setPicking(false);
      setQuery('');
    } catch {
      setError('That time zone could not be saved.');
    }
  }

  async function useDevice() {
    setError(null);
    try {
      await clearTimezoneOverride();
      setState(await getTimezoneState());
    } catch {
      setError('Could not switch back to the device time zone.');
    }
  }

  if (picking) {
    return (
      <View testID="timezone-picker" className="flex-1" style={{ paddingBottom: clearance }}>
        <View className="gap-3 p-4">
          <TextInput
            testID="timezone-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search time zones"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[inputTextStyle, { color: colors.foreground }]}
            className="rounded-tile border border-border bg-card px-4 py-3"
          />
          {error ? <Text className="text-caption text-destructive">{error}</Text> : null}
        </View>
        <FlatList
          data={matches}
          keyExtractor={(zone) => zone}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListEmptyComponent={<Text className="p-4 text-center text-muted-foreground">No matching time zones.</Text>}
          renderItem={({ item }) => (
            <Pressable testID={`timezone-option-${item}`} onPress={() => choose(item)} className="py-3 active:opacity-70">
              <Text className={item === state?.timezone ? 'font-semibold' : ''}>{item}</Text>
            </Pressable>
          )}
        />
        <View className="items-center p-2">
          <Button testID="timezone-cancel-button" variant="ghost" size="sm" onPress={() => setPicking(false)}>
            Cancel
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="px-5 pt-4">
      <SettingsGroup label="Time zone" footer={error ?? undefined}>
        <SettingsRow
          testID="timezone-row"
          icon="globe-outline"
          tint={colors.metricHrv}
          title={state?.overridden ? 'Custom time zone' : 'Device time zone'}
          value={state ? state.timezone : '…'}
          valueTestID="timezone-value"
          onPress={() => setPicking(true)}
        />
        {state?.overridden ? (
          <SettingsRow testID="use-device-timezone-button" icon="phone-portrait-outline" title="Use device time zone" onPress={useDevice} />
        ) : null}
      </SettingsGroup>
    </View>
  );
}
