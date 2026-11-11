import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { fetchIdentity, type BuddyIdentity } from '../../api/buddies';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { HandleSetupForm } from './HandleSetupForm';

type GateState = { status: 'loading' } | { status: 'ready'; identity: BuddyIdentity } | { status: 'error' };

// The first time someone opens Buddies or Pair up they set a handle and display name (spec §2).
export function IdentityGate({ children }: { children: (identity: BuddyIdentity) => React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'loading' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', identity: await fetchIdentity() });
    } catch {
      setState({ status: 'error' });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <View testID="buddy-identity-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View testID="buddy-identity-error" className="flex-1 items-center justify-center gap-3 p-6">
        <Text className="text-muted-foreground">Couldn't load buddies.</Text>
        <Button testID="buddy-identity-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
      </View>
    );
  }
  if (!state.identity.handle) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <HandleSetupForm identity={state.identity} mode="setup" onSaved={(identity) => setState({ status: 'ready', identity })} />
      </ScrollView>
    );
  }
  return <>{children(state.identity)}</>;
}
