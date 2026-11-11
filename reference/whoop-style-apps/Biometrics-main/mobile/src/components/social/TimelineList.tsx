// Today timeline (spec 2026-10-07 social §5, design V5): time, a dot on a vertical connector line, the line with
// the name bold and the rest muted, and a one-tap sticker (Cheer / Rest up). A locked check-in ("Sam checked in")
// has no mood and no action until I check in. Items of a kind this app doesn't know are skipped.

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { buddyErrorCode, sendSticker } from '../../api/buddies';
import type { TimelineItem } from '../../api/social';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { clockTime, knownTimelineItems, timelineAction, timelineParts } from '../../lib/socialCopy';
import { refreshSocial } from '../../lib/socialStore';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

const DOT: Record<TimelineItem['kind'], string> = {
  checkin: '#93C5FD', step_goal: '#FB923C', badge: '#FCD34D', sticker: '#F9A8D4', recap_share: '#A5B4FC', goodnight: '#A78BFA', camp_note: '#C7D2FE',
};
const LABEL = { cheer: 'Cheer', rest_up: 'Rest up' } as const;
const KIND = { cheer: 'CHEER', rest_up: 'REST_UP' } as const;
/** Time column (w-11 = 44) + gap (12) + half the 10 px dot − half the 2 px line. */
const CONNECTOR_LEFT = 44 + 12 + 5 - 1;
const ROW_HEIGHT = 32;

export function TimelineList({ items }: { items: TimelineItem[] }) {
  const rows = knownTimelineItems(items);
  // `busy` disables the buttons only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function act(item: TimelineItem, action: 'cheer' | 'rest_up') {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await sendSticker(item.actor.id, KIND[action]);
      void refreshSocial();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (rows.length === 0) {
    return <Text testID="timeline-empty" className="text-caption text-muted-foreground">Nothing yet today. Check in to get things going.</Text>;
  }
  return (
    <View testID="timeline" className="gap-3">
      <View>
        {rows.length > 1 ? (
          <View testID="timeline-connector" pointerEvents="none"
            style={{ position: 'absolute', left: CONNECTOR_LEFT, top: ROW_HEIGHT / 2, bottom: ROW_HEIGHT / 2, width: 2, backgroundColor: '#2A2E38' }} />
        ) : null}
        {rows.map((item) => {
          const action = timelineAction(item);
          const { name, rest } = timelineParts(item);
          return (
            <View key={item.id} testID={`timeline-${item.id}`} className="flex-row items-center gap-3" style={{ minHeight: ROW_HEIGHT }}>
              <Text className="w-11 text-right text-caption text-muted-foreground tabular-nums">{clockTime(item.at)}</Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT[item.kind] }} />
              <Text className="flex-1 text-body">
                <Text testID={`timeline-${item.id}-name`} className="font-semibold">{name}</Text>
                <Text className="text-muted-foreground"> {rest}</Text>
              </Text>
              {action ? (
                <Button testID={`timeline-${item.id}-action`} variant="outline" size="xs" disabled={busy} onPress={() => void act(item, action)}>
                  {LABEL[action]}
                </Button>
              ) : null}
            </View>
          );
        })}
      </View>
      {message ? <Text testID="timeline-message" className="text-caption text-destructive">{message}</Text> : null}
    </View>
  );
}
