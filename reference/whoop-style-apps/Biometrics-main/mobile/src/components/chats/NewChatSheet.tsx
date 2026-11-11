import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useBuddies } from '../../lib/buddiesStore';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';
import { ChatAvatar } from './ChatAvatar';

// "New message" (spec §8.1): pick one of my buddies (the buddies store's loaded list); no buddies yet → Add a buddy.
// The buddy rows are not buttons (allowlisted); Add a buddy is the default lg Button (plan ruling P5).
export function NewChatSheet({ visible, onClose, onPick, onAdd }: { visible: boolean; onClose: () => void; onPick: (buddyId: string) => void; onAdd: () => void }) {
  const store = useBuddies();
  const rows = store.status === 'ready' ? store.page.buddies : [];
  return (
    <Sheet visible={visible} onClose={onClose} testID="new-chat">
      <View className="gap-2 pb-2">
        <Text className="text-heading">New message</Text>
        {rows.length === 0 ? (
          <>
            <Text className="text-caption text-muted-foreground">No buddies yet.</Text>
            <Button testID="new-chat-add" size="lg" className="w-full" onPress={onAdd}>Add a buddy</Button>
          </>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                testID={`new-chat-${row.id}`}
                onPress={() => onPick(row.id)}
                accessibilityRole="button"
                accessibilityLabel={`Message ${row.displayName}`}
                className="flex-row items-center gap-3 py-2 active:opacity-70"
              >
                <ChatAvatar person={row} size={40} />
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-semibold">{row.displayName}</Text>
                  <Text numberOfLines={1} className="text-caption text-muted-foreground">@{row.handle}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Sheet>
  );
}
