import React from 'react';
import { View } from 'react-native';
import { MOOD_NOTICE_TEXT } from '../../lib/buddyCopy';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

export interface MoodNoticeSheetProps {
  visible: boolean;
  failed: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function MoodNoticeSheet({ visible, failed, onConfirm, onClose }: MoodNoticeSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} testID="mood-notice-sheet">
      <View testID="mood-notice" className="gap-4 p-4">
        <Text className="text-heading">Your mood is shared</Text>
        <Text className="text-muted-foreground">{MOOD_NOTICE_TEXT}</Text>
        {failed ? <Text testID="mood-notice-failed" className="text-caption text-destructive">Couldn't save that. Please try again.</Text> : null}
        <Button testID="mood-notice-confirm" size="lg" onPress={onConfirm}>Got it</Button>
        <Button testID="mood-notice-cancel" variant="outline" size="lg" onPress={onClose}>Not now</Button>
      </View>
    </Sheet>
  );
}
