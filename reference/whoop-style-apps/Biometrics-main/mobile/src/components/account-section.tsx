import React, { useContext } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useOptionalAuth } from '../auth/AuthContext';
import { COLORS } from '../theme';
import { SettingsGroup, SettingsRow } from './ui/settings-list';

// Settings -> Account. Uses the navigation context rather than useNavigation()
// because Settings is also rendered without a navigator (see SettingsScreen),
// and the optional auth hook for the same reason. Sign out lives here now that
// Home no longer carries it in its header. Profile's Sign-in screen leaves the row out: the hub's
// Account area carries Sign out there.
export function AccountSection({ showSignOut = true }: { showSignOut?: boolean } = {}) {
  const navigation = useContext(NavigationContext);
  const auth = useOptionalAuth();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <SettingsGroup label="Account">
      <SettingsRow
        testID="sign-in-methods-row"
        icon="key-outline"
        tint={colors.metricSleep}
        title="Sign-in methods"
        subtitle="Apple, Google, email and password"
        onPress={() => navigation?.navigate('SignInMethods' as never)}
      />
      <SettingsRow
        testID="devices-row"
        icon="phone-portrait-outline"
        tint={colors.metricSleep}
        title="Devices"
        subtitle="Where you are signed in"
        onPress={() => navigation?.navigate('Devices' as never)}
      />
      {auth && showSignOut ? (
        <SettingsRow testID="sign-out-button" icon="log-out-outline" tint={colors.muted} title="Sign out" onPress={() => auth.signOut()} />
      ) : null}
    </SettingsGroup>
  );
}
