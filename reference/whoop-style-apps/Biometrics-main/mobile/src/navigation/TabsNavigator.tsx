import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'nativewind';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CoachScreen } from '../screens/CoachScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { COLORS } from '../theme';
import { FloatingTabBar } from './FloatingTabBar';
import { HeaderTitle, headerTitleStyle } from './headerStyle';

export type TabParamList = {
  Home: undefined;
  // `date` opens that day's steps sheet once (the Sleep page's Steps that day).
  Activity: { date?: string } | undefined;
  // `prefill` seeds the chat input (never sent automatically).
  Coach: { prefill?: string } | undefined;
  Social: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export function TabsNavigator() {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: headerTitleStyle(colors.foreground),
        headerTitle: (props) => <HeaderTitle {...props} />,
        headerTintColor: colors.foreground,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Coach" component={CoachScreen} options={{ title: 'AI Coach', headerShown: false }} />
      <Tab.Screen name="Social" component={SocialScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={SettingsScreen} options={{ title: 'Profile', headerShown: false }} />
    </Tab.Navigator>
  );
}
