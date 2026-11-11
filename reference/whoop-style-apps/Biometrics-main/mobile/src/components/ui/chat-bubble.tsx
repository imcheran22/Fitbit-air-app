import React from 'react';
import { View } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';
import { StreamingText } from './streaming-text';
import type { CoachMessageSource } from '../../api/coach';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  text: string;
  // Recorded for callers; a 'fallback' reply is deliberately styled exactly
  // like a model reply (it is a normal answer to the user).
  source?: CoachMessageSource;
  // Fade a newly arrived assistant reply in; history renders instantly.
  animate?: boolean;
  // Content beneath the text, e.g. the safety resources block.
  children?: React.ReactNode;
}

// One coach-conversation message. The user's words sit right in an accent
// bubble with a tucked corner; the coach's answer is not boxed at all -- it
// reads as text on the page, like an editor's reply rather than a chat
// balloon. Assistant text goes through StreamingText (a single fade, not a
// typing effect).
export function ChatBubble({ role, text, animate = true, children }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <View className={cn('w-full', isUser ? 'items-end' : 'items-start')}>
      <View
        testID={`chat-bubble-${role}`}
        className={cn('gap-3', isUser ? 'max-w-[82%] rounded-[20px] rounded-br-md bg-accent px-4 py-2.5' : 'w-full py-1')}
      >
        {isUser ? (
          <Text className="text-body text-accent-foreground">{text}</Text>
        ) : (
          <StreamingText text={text} animate={animate} className="text-body" />
        )}
        {children}
      </View>
    </View>
  );
}
