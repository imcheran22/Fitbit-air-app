import React from 'react';
import { View } from 'react-native';
import { Button } from '../ui/button';

// Short follow-up questions under the latest answer (spec 1.3). The caller
// passes followUpsFor(card, lastUserMessage); an empty list renders nothing.
// Tapping one sends it; they do nothing while an answer is still streaming.
// Button's hitSlop grows each 32pt chip to a 44pt target. A long question
// wraps instead of truncating: the chip grows from 32pt with 6px of padding
// above and below its 18px lines (the sm box, 32 = 18 + 2*6 + 2*1 border).
export function FollowUpChips({ questions, onAsk, disabled = false }: { questions: string[]; onAsk: (question: string) => void; disabled?: boolean }) {
  if (questions.length === 0) return null;
  return (
    <View testID="follow-up-chips" className="flex-row flex-wrap gap-2">
      {questions.map((question, index) => (
        <Button
          key={`${question}-${index}`}
          testID={`follow-up-${index}`}
          variant="outline"
          size="sm"
          accessibilityLabel={question}
          accessibilityHint="Asks your coach"
          disabled={disabled}
          onPress={() => onAsk(question)}
          numberOfLines={0}
          className="h-auto min-h-[32px] max-w-full py-[6px]"
          textClassName="shrink text-center"
          labelTestID={`follow-up-${index}-label`}
        >
          {question}
        </Button>
      ))}
    </View>
  );
}
