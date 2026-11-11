import { useEffect } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/RootNavigator';

// A redirect shim (spec §5.1 #15, §5.3): SLEEP has the Sleep page, RECOVERY the Recovery page. Removing the route and
// its now-unused components is a later clean-up (spec §9).
export function ScoreDetailScreen() {
  const navigation = useNavigation<any>();
  const { date, type = 'RECOVERY' } = useRoute<RouteProp<RootStackParamList, 'ScoreDetail'>>().params;
  useEffect(() => {
    navigation.replace(type === 'SLEEP' ? 'Sleep' : 'Recovery', { date });
  }, [navigation, type, date]);
  return null;
}
