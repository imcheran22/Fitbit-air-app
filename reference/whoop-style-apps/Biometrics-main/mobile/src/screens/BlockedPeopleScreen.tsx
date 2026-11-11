import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buddyErrorCode, fetchBlocked, unblock, type BlockedPerson } from '../api/buddies';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { Button } from '../components/ui/button';
import { Text } from '../components/ui/text';

// Profile → Buddies → Blocked people: exactly what the server lists (handle and name). Unblocking
// tells no one; requests hidden by the block stay hidden.
export function BlockedPeopleScreen() {
  const [people, setPeople] = useState<BlockedPerson[] | null | 'error'>(null);
  const [error, setError] = useState<string | null>(null);
  // The in-flight guard (a ref, so a second tap before the next render is still ignored) and the
  // row it is working on.
  const inFlight = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchBlocked()
      .then((list) => {
        if (mounted.current) setPeople(list);
      })
      .catch(() => {
        if (mounted.current) setPeople('error');
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function lift(userId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(userId);
    setError(null);
    try {
      await unblock(userId);
      void refreshBuddies();
      if (mounted.current) setPeople((prev) => (Array.isArray(prev) ? prev.filter((p) => p.userId !== userId) : prev));
    } catch (e) {
      // Keep the row; a later tap retries.
      if (mounted.current) setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusyId(null);
    }
  }

  if (people === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (people === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-background p-6">
        <Text testID="blocked-load-failed" className="text-muted-foreground">Couldn't load blocked people.</Text>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 8 }}
        data={people}
        keyExtractor={(p) => p.userId}
        ListHeaderComponent={error ? <Text testID="blocked-error" className="pb-2 text-caption text-destructive">{error}</Text> : null}
        ListEmptyComponent={<Text testID="blocked-empty" className="py-8 text-center text-muted-foreground">You haven't blocked anyone.</Text>}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between rounded-card border border-border bg-card p-3">
            <View className="flex-1 pr-3">
              <Text className="font-semibold">{item.displayName}</Text>
              <Text className="text-caption text-muted-foreground">@{item.handle}</Text>
            </View>
            <Button
              testID={`unblock-${item.userId}`}
              size="sm"
              variant="secondary"
              disabled={busyId !== null}
              onPress={() => void lift(item.userId)}
            >
              Unblock
            </Button>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
