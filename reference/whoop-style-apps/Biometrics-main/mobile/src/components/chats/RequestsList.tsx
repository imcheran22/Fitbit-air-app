import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import {
  acceptRequest, blockFromRequest, buddyErrorCode, cancelRequest, declineRequest, fetchRequests, type IncomingRequest, type OutgoingRequest,
} from '../../api/buddies';
import type { useMoodNoticeGate } from '../buddies/useMoodNoticeGate';
import { PersonKip } from '../kip/PersonKip';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { refreshBuddies } from '../../lib/buddiesStore';
import { offerPushAfterPairing } from '../../lib/buddyPushOffer';
import { shortAgo } from '../../lib/chatCopy';
import { refreshSocial } from '../../lib/socialStore';
import { COLORS } from '../../theme';

type Gate = ReturnType<typeof useMoodNoticeGate>;
type RequestItem = { kind: 'in'; request: IncomingRequest } | { kind: 'out'; request: OutgoingRequest };

/** "@mia.runs · 2h"; the age is left out when the server sent no usable time. */
function fromLine(r: IncomingRequest, now: number): string {
  const handle = `@${r.from.handle}`;
  return Number.isFinite(Date.parse(r.createdAt)) ? `${handle} · ${shortAgo(r.createdAt, now)}` : handle;
}

// Buddy requests (spec 2026-10-06 buddies §4; spec 2026-10-07 social §8.1: they live in Chats › Requests; the
// owner-approved Requests board): incoming ones as cards (their coach, name, @handle and age, a "…" button that
// blocks, then Decline / Accept side by side), and mine still pending. Moved from the Buddies screen; accepting hands
// the new buddy's id to `onAccepted` (Chats opens their thread, Buddies their week).
export function RequestsList({ gate, onAccepted }: { gate: Gate; onAccepted: (buddyId: string) => void }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const [lists, setLists] = useState<{ incoming: IncomingRequest[]; outgoing: OutgoingRequest[] } | null | 'error'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` disables the buttons only after a re-render; a double tap in one frame calls the API once.
  const inFlight = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    try {
      const next = await fetchRequests();
      if (live.current) setLists(next);
    } catch {
      if (live.current) setLists('error');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // One answer at a time. The lists are re-read either way (a refused answer may mean the request
  // is gone); the shared buddies refresh after an answer that went through.
  function perform(fn: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    void (async () => {
      try {
        try {
          await fn();
          void refreshBuddies();
          void refreshSocial();
        } catch (e) {
          if (live.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
        }
        await load();
      } finally {
        inFlight.current = false;
        if (live.current) setBusy(false);
      }
    })();
  }
  // Accepting pairs, so it waits for the one-time mood notice; the guard sits inside the held
  // action, so "Not now" leaves nothing taken.
  const accept = (id: string) =>
    gate.run(() =>
      perform(async () => {
        const { buddyId } = await acceptRequest(id);
        onAccepted(buddyId);
        // After the navigation, never awaited: the first pairing on this device offers notifications once.
        void offerPushAfterPairing();
      }),
    );
  // The card's "…" button (the board's ellipsis) blocks: it is labelled Block and asks first.
  const block = (r: IncomingRequest) => {
    if (inFlight.current) return;
    Alert.alert(`Block ${r.from.displayName}?`, "They won't be told. You can unblock them in Profile.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => perform(() => blockFromRequest(r.id)) },
    ]);
  };

  if (lists === null) return <ActivityIndicator testID="requests-loading" />;
  if (lists === 'error') return <Text testID="requests-error" className="py-8 text-center text-muted-foreground">Couldn't load requests.</Text>;
  const items: RequestItem[] = [
    ...lists.incoming.map((request) => ({ kind: 'in' as const, request })),
    ...lists.outgoing.map((request) => ({ kind: 'out' as const, request })),
  ];
  const now = Date.now();
  return (
    <FlatList
      testID="requests-list"
      data={items}
      keyExtractor={(i) => `${i.kind}-${i.request.id}`}
      contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
      ListHeaderComponent={message ? <Text testID="requests-message" className="text-caption text-destructive">{message}</Text> : null}
      ListEmptyComponent={<Text testID="requests-empty" className="py-8 text-center text-muted-foreground">No requests right now.</Text>}
      renderItem={({ item }) =>
        item.kind === 'in' ? (
          <View testID={`request-in-${item.request.id}`} className="gap-3 rounded-[18px] border border-border bg-card p-3.5">
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
                <PersonKip colour={item.request.from.kipColour} size={28} />
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="text-body font-semibold">{item.request.from.displayName}</Text>
                <Text numberOfLines={1} className="text-caption text-muted-foreground">{fromLine(item.request, now)}</Text>
              </View>
              <Button
                testID={`request-block-${item.request.id}`}
                variant="ghost"
                size="icon-sm"
                accessibilityLabel={`Block ${item.request.from.displayName}`}
                disabled={busy}
                onPress={() => block(item.request)}
              >
                <Ionicons name="ellipsis-horizontal" size={buttonIconSize('icon-sm')} color={colors.muted} />
              </Button>
            </View>
            <View className="flex-row gap-2">
              <Button testID={`request-decline-${item.request.id}`} variant="outline" className="flex-1" disabled={busy} onPress={() => perform(() => declineRequest(item.request.id))}>Decline</Button>
              <Button testID={`request-accept-${item.request.id}`} className="flex-1" disabled={busy} onPress={() => accept(item.request.id)}>Accept</Button>
            </View>
          </View>
        ) : (
          <View testID={`request-out-${item.request.id}`} className="flex-row items-center justify-between rounded-[18px] border border-border bg-card p-3.5">
            {/* The handle as typed when sent; an older request has none, so it reads neutrally. */}
            <Text className="flex-1 text-body">{item.request.toHandle ? `@${item.request.toHandle} · Pending` : 'Pending request'}</Text>
            <Button testID={`request-cancel-${item.request.id}`} size="sm" variant="ghost" disabled={busy} onPress={() => perform(() => cancelRequest(item.request.id))}>Cancel</Button>
          </View>
        )
      }
    />
  );
}
