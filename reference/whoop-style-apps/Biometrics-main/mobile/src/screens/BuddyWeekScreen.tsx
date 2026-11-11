import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  NUMBER_KEYS, blockBuddy, buddyErrorCode, fetchBuddyWeek, sendSticker, setMuted, unpair, type BuddyWeek, type StickerKind,
} from '../api/buddies';
import { StickerButton } from '../components/buddies/StickerButton';
import { PersonKip, personStateOf } from '../components/kip/PersonKip';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PageTitle } from '../components/ui/page-title';
import { Text } from '../components/ui/text';
import { FAMILY_NAMES, numeral } from '../lib/badges';
import {
  BUDDY_WEEK_COPY, MOOD_COLORS, MOOD_WORDS, NUMBER_LABELS, STICKERS, TILE_COLORS, buddyErrorMessage, formatNumber, sharesSummary, stickerSentLine, weekdayLetter, weekdayName,
} from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { refreshSocial } from '../lib/socialStore';

type WeekState = { status: 'loading' } | { status: 'ready'; week: BuddyWeek } | { status: 'gone' } | { status: 'error' };

// not_buddies (a 403: unpaired or blocked meanwhile) and a 404 both mean there is no week to show.
const isGone = (e: unknown) => buddyErrorCode(e) === 'not_buddies' || (e as { status?: number } | null)?.status === 404;
const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

// A buddy's week (spec 2026-10-06 buddies §5, design 2a): today's mood line, 7 mood tiles, only the
// numbers they share, badge levels if shared, stickers, and mute / unpair / block. All text is
// fixed copy; nothing here reaches the coach. Only what the server sent is shown: a number key it
// left out has no row, and a day without a reading is a dash, never 0.
export function BuddyWeekScreen() {
  const navigation = useNavigation() as unknown as { goBack: () => void };
  const { buddyId } = (useRoute() as { params: { buddyId: string } }).params;
  const [state, setState] = useState<WeekState>({ status: 'loading' });
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` disables the buttons only after a re-render; a double tap in one frame calls the API once.
  const inFlight = useRef(false);
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
      const week = await fetchBuddyWeek(buddyId);
      if (mounted.current) setState({ status: 'ready', week });
    } catch (e) {
      if (!mounted.current) return;
      if (isGone(e)) {
        setState({ status: 'gone' });
        void refreshBuddies();
        void refreshSocial();
      } else {
        setState({ status: 'error' });
      }
    }
  }, [buddyId]);
  useEffect(() => {
    void load();
  }, [load]);

  // One action at a time. A not_buddies answer means they unpaired or blocked meanwhile: the week
  // goes away and nothing more is offered.
  function perform(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    void (async () => {
      try {
        await fn();
      } catch (e) {
        if (!mounted.current) return;
        if (buddyErrorCode(e) === 'not_buddies') {
          setState({ status: 'gone' });
          void refreshBuddies();
          void refreshSocial();
        } else {
          setNote({ text: buddyErrorMessage(buddyErrorCode(e)), error: true });
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    })();
  }

  if (state.status === 'loading') {
    return <SafeAreaView className="flex-1 items-center justify-center bg-background"><ActivityIndicator testID="buddy-week-loading" /></SafeAreaView>;
  }
  if (state.status === 'gone') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background p-6">
        <Text testID="buddy-week-gone" className="text-center text-muted-foreground">{buddyErrorMessage('not_buddies')}</Text>
      </SafeAreaView>
    );
  }
  if (state.status === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text testID="buddy-week-error" className="text-muted-foreground">Couldn't load this week.</Text>
        <Button testID="buddy-week-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
      </SafeAreaView>
    );
  }

  const { week } = state;
  const rows = NUMBER_KEYS.filter((key) => Array.isArray(week.numbers?.[key]));
  const badges = (week.badges ?? []).filter((b) => hasOwn(FAMILY_NAMES, b.family) && numeral(b.level) !== '');

  const sticker = (kind: StickerKind) =>
    perform(async () => {
      await sendSticker(buddyId, kind);
      if (mounted.current) setNote({ text: stickerSentLine(kind, week.buddy.displayName), error: false });
    });
  // Not optimistic: the label flips to what the server says, so a failure leaves it as it was.
  const toggleMute = () =>
    perform(async () => {
      const { muted } = await setMuted(buddyId, !week.muted);
      if (mounted.current) setState((s) => (s.status === 'ready' ? { status: 'ready', week: { ...s.week, muted } } : s));
    });
  const confirm = (title: string, action: string, fn: () => Promise<void>) => {
    if (inFlight.current) return;
    Alert.alert(title, "They won't be told.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () =>
          perform(async () => {
            await fn();
            void refreshBuddies();
            void refreshSocial();
            if (mounted.current) navigation.goBack();
          }),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="items-center gap-1">
          <PersonKip colour={week.buddy.kipColour} state={personStateOf(week.mood)} size={96} />
          <PageTitle testID="buddy-week-name">{week.buddy.displayName}</PageTitle>
          <Text className="text-caption text-muted-foreground">@{week.buddy.handle}</Text>
          <Text testID="buddy-week-line" className="text-center" style={{ color: MOOD_COLORS[week.mood] }}>{week.moodLine}</Text>
        </View>

        <Card className="gap-3 p-4">
          <Text className="font-semibold">{BUDDY_WEEK_COPY.thisWeek}</Text>
          <View className="flex-row justify-between">
            {week.tiles.map((tile, i) => (
              <View key={tile.date} className="items-center gap-1">
                <View
                  testID={`week-tile-${i}`}
                  accessible
                  accessibilityLabel={`${weekdayName(tile.date)}: ${MOOD_WORDS[tile.mood]}`}
                  className="h-9 w-9 rounded-lg border border-border"
                  style={{ backgroundColor: TILE_COLORS[tile.mood] }}
                />
                <Text className="text-fine text-muted-foreground">{weekdayLetter(tile.date)}</Text>
              </View>
            ))}
          </View>
          {rows.map((key) => (
            <View key={key} testID={`number-row-${key}`} className="gap-1">
              <Text className="text-caption text-muted-foreground">{NUMBER_LABELS[key]}</Text>
              <View className="flex-row justify-between">
                {week.numbers[key]!.map((d, i) => {
                  const shown = formatNumber(key, d.value);
                  // The day is in the label: a screen reader otherwise reads seven bare numbers.
                  const label = `${weekdayName(d.date)}: ${NUMBER_LABELS[key]}${shown === '–' ? ', no data' : ` ${shown}`}`;
                  return (
                    <Text key={d.date} testID={`number-${key}-${i}`} accessibilityLabel={label} className="w-9 text-center text-fine tabular-nums">
                      {shown}
                    </Text>
                  );
                })}
              </View>
            </View>
          ))}
          {badges.length > 0 ? (
            <View testID="week-badges" className="flex-row flex-wrap gap-2">
              {badges.map((b) => (
                <Text key={b.family} className="rounded-full bg-muted px-3 py-1 text-caption">{`${FAMILY_NAMES[b.family]} ${numeral(b.level)}`}</Text>
              ))}
            </View>
          ) : null}
        </Card>

        <View className="gap-2">
          <Text className="font-semibold">Send {week.buddy.displayName} a sticker</Text>
          <View className="flex-row gap-2">
            {STICKERS.map((s) => (
              <StickerButton key={s.kind} kind={s.kind} label={s.label} icon={s.icon} disabled={busy} onPress={() => sticker(s.kind)} />
            ))}
          </View>
          {note ? <Text testID="buddy-week-note" className={note.error ? 'text-caption text-destructive' : 'text-caption text-muted-foreground'}>{note.text}</Text> : null}
        </View>

        <Text testID="buddy-week-summary" className="text-center text-caption text-muted-foreground">
          {sharesSummary(week.buddy.displayName, week.shares)}
        </Text>

        <View className="flex-row justify-center gap-2">
          <Button testID="buddy-mute" size="sm" variant="outline" disabled={busy} onPress={toggleMute}>{week.muted ? 'Unmute' : 'Mute'}</Button>
          <Button testID="buddy-unpair" size="sm" variant="ghost" disabled={busy} onPress={() => confirm(`Unpair from ${week.buddy.displayName}?`, 'Unpair', () => unpair(buddyId))}>Unpair</Button>
          <Button testID="buddy-block" size="sm" variant="destructive" disabled={busy} onPress={() => confirm(`Block ${week.buddy.displayName}?`, 'Block', () => blockBuddy(buddyId))}>Block</Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
