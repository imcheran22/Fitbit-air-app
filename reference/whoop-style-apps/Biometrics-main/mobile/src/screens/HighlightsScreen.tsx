import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buddyErrorCode, sendSticker } from '../api/buddies';
import { fetchHighlights, type HighlightItem, type Highlights } from '../api/social';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PageTitle } from '../components/ui/page-title';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { weekRange } from '../lib/recapCopy';
import { highlightKicker, highlightKickerColor, highlightLine, highlightsTitle, knownHighlights } from '../lib/socialCopy';
import { refreshSocial } from '../lib/socialStore';

type State = { status: 'loading' } | { status: 'ready'; highlights: Highlights | null } | { status: 'error' };

// Last week's highlights in full (spec 2026-10-07 social §7), opened from the carousel's "All": the week's title and
// range, then one card per highlight with its colour-coded kicker and line, and a Cheer for a buddy's. Fixed copy
// only, no health numbers. Types this app doesn't know are skipped; a week with none left reads as quiet.
export function HighlightsScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // `busy` disables the buttons only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Loads once per mount (and on "Try again"); a failure never retries by itself.
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const highlights = await fetchHighlights();
      if (mounted.current) setState({ status: 'ready', highlights });
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function cheer(item: HighlightItem) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await sendSticker(item.actor.id, 'CHEER');
      void refreshSocial();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
        <View testID="highlights-loading" className="gap-3 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </View>
      </SafeAreaView>
    );
  }
  if (state.status === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text testID="highlights-error" className="text-muted-foreground">Couldn't load the highlights.</Text>
        <Button testID="highlights-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
      </SafeAreaView>
    );
  }

  const { highlights } = state;
  const items = highlights ? knownHighlights(highlights.items) : [];
  if (!highlights || items.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background p-6">
        <Text testID="highlights-quiet" className="text-center text-muted-foreground">
          A quiet week. Check in and send a few stickers to fill next week's highlights.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View className="gap-1">
          <PageTitle testID="highlights-heading">{highlightsTitle(highlights.weekStart)}</PageTitle>
          <Text className="text-caption text-muted-foreground">{weekRange(highlights.weekStart, highlights.weekEnd)}</Text>
        </View>
        {items.map((item, index) => {
          const color = highlightKickerColor(item);
          return (
            <Card key={index} testID={`highlights-item-${index}`} className="flex-row items-center gap-3">
              <View className="flex-1 gap-1">
                <Text className={`text-label uppercase ${color ? '' : 'text-muted-foreground'}`}
                  style={color ? { color } : undefined}>
                  {highlightKicker(item)}
                </Text>
                <Text className="font-semibold">{highlightLine(item)}</Text>
              </View>
              {item.mine ? null : (
                <Button testID={`highlights-item-${index}-cheer`} variant="outline" size="xs" disabled={busy} onPress={() => void cheer(item)}>
                  Cheer
                </Button>
              )}
            </Card>
          );
        })}
        {message ? <Text testID="highlights-message" className="text-caption text-destructive">{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
