import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { fetchBuddyPage, type BuddyRow } from '../api/buddies';
import { BuddyListRow } from '../components/buddies/BuddyListRow';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { Button } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { refreshBuddies, useBuddies } from '../lib/buddiesStore';
import { useRefreshBuddiesOnFocus } from '../lib/useRefreshBuddiesOnFocus';

type Nav = { navigate: (name: string, params?: object) => void };

/** Rows in order, each id once (a page boundary can repeat a row). */
function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// All buddies (spec 2026-10-07 social §2): the paged buddy list, reached from the stories row's "See all". Its Requests
// tab moved to Chats › Requests and its Activity tab gave way to the Social timeline (S3). The header line is fixed text.
export function BuddiesScreen() {
  const navigation = useNavigation() as unknown as Nav;
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <IdentityGate>{() => <BuddiesBody navigation={navigation} />}</IdentityGate>
    </SafeAreaView>
  );
}

function BuddiesBody({ navigation }: { navigation: Nav }) {
  useRefreshBuddiesOnFocus();
  return (
    <View className="flex-1 gap-3 px-4 pt-3">
      <Text className="text-caption text-muted-foreground">You see their coach's mood, never their numbers unless they share them.</Text>
      <BuddyList navigation={navigation} />
    </View>
  );
}

function BuddyList({ navigation }: { navigation: Nav }) {
  const store = useBuddies();
  const first = store.status === 'ready' ? store.page : null;
  const [more, setMore] = useState<BuddyRow[]>([]);
  // undefined: follow the store's first page; null: no more pages.
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // `loading` shows only after a re-render; two end-reached events in one frame load a page once.
  const loadingRef = useRef(false);
  // A fresh first page (focus, after a request is answered) starts paging over; a page that was
  // loading for the old list is dropped.
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setMore([]);
    setCursor(undefined);
  }, [first]);
  const rows = useMemo(() => uniqueById([...(first?.buddies ?? []), ...more]), [first, more]);

  if (store.status === 'idle') return <ActivityIndicator testID="buddies-loading" />;
  if (!first) {
    return (
      <View testID="buddies-error" className="items-center gap-3 py-8">
        <Text className="text-muted-foreground">Couldn't load your buddies.</Text>
        <Button variant="secondary" onPress={() => void refreshBuddies()}>Try again</Button>
      </View>
    );
  }
  const next = cursor === undefined ? first.nextCursor : cursor;

  async function loadMore() {
    if (!next || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const at = generation.current;
    try {
      const page = await fetchBuddyPage(next);
      if (page && at === generation.current) {
        setMore((prev) => [...prev, ...page.buddies]);
        setCursor(page.nextCursor);
      }
    } catch {
      // Keep what is shown; the next scroll to the end tries again.
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <FlatList
      testID="buddies-list"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <BuddyListRow row={item} onPress={() => navigation.navigate('BuddyWeek', { buddyId: item.id })} />}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<Text testID="buddies-empty" className="py-8 text-center text-muted-foreground">No buddies yet. Pair up with a friend to see each other's mood.</Text>}
      ListFooterComponent={
        <View className="gap-3 py-4">
          {loading ? <ActivityIndicator /> : null}
          <Button testID="buddies-add" size="lg" onPress={() => navigation.navigate('PairUp')}>Add a buddy</Button>
        </View>
      }
    />
  );
}
