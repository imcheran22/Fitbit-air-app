import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { CoachTurnError } from '../../lib/useCoachConversation';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export const ERROR_COPY: Record<CoachTurnError['kind'], string> = {
  unavailable: "I couldn't answer that just now.",
  timeout: 'That took too long. Nothing was lost; you can try again.',
  interrupted: 'The answer stopped part-way. You can try again.',
  // 409 turn_in_progress: the previous answer is still being written.
  busy: "I'm still finishing your last answer. Give it a moment, then try again.",
  // 429 without a Retry-After; with one, errorCopy says when.
  rate_limited: "You've sent a lot of messages in a short time. Try again a little later.",
};

// 'interrupted' when not one event arrived: the answer never started.
const DROPPED_BEFORE_ANSWER = 'The connection dropped before I could answer. You can try again.';
// 'unavailable' when the server says retrying the same question would not help.
const REPHRASE_HINT = 'Try asking it a different way.';

const RATE_LIMITED_LEAD = "You've sent a lot of messages in a short time.";
// Once Retry-After has passed and Try again is enabled again.
const RATE_LIMIT_OVER = `${RATE_LIMITED_LEAD} You can try again now.`;

function waitWords(seconds: number): string {
  if (seconds < 45) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes <= 1) return 'about a minute';
  if (minutes < 90) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hours`;
}

export function errorCopy(error: CoachTurnError): string {
  if (error.kind === 'rate_limited' && error.retryAfterSeconds !== undefined) {
    return `${RATE_LIMITED_LEAD} Try again in ${waitWords(error.retryAfterSeconds)}.`;
  }
  if (error.kind === 'interrupted' && !error.received) return DROPPED_BEFORE_ANSWER;
  if (error.kind === 'unavailable' && !error.retryable) return `${ERROR_COPY.unavailable} ${REPHRASE_HINT}`;
  return ERROR_COPY[error.kind];
}

// setTimeout's ceiling (about 24.8 days); a longer wait is clamped, never fired at once.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function waitMs(error: CoachTurnError): number {
  return error.kind === 'rate_limited' && error.retryAfterSeconds !== undefined && error.retryAfterSeconds > 0
    ? Math.min(error.retryAfterSeconds * 1000, MAX_TIMEOUT_MS)
    : 0;
}

// True until the server's Retry-After has passed, counted from when this error appeared.
function useWaiting(error: CoachTurnError): boolean {
  // The error whose wait has run out; a new error object starts a new wait.
  const [elapsed, setElapsed] = useState<CoachTurnError | null>(null);
  useEffect(() => {
    const ms = waitMs(error);
    if (ms === 0) return;
    const timer = setTimeout(() => setElapsed(error), ms);
    return () => clearTimeout(timer);
  }, [error]);
  return waitMs(error) > 0 && elapsed !== error;
}

// A turn that did not finish (spec 6): muted and distinct from an answer, so
// it is never read as the coach's reply, with Retry when retrying can help.
export function ErrorCard({ error, onRetry }: { error: CoachTurnError; onRetry: () => void }) {
  const waiting = useWaiting(error);
  const copy = waitMs(error) > 0 && !waiting ? RATE_LIMIT_OVER : errorCopy(error);
  // Announced once per error. Android reads the polite live region below;
  // iOS has no live regions, so it is announced explicitly.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(errorCopy(error));
  }, [error]);

  return (
    <View accessibilityRole="alert" className="gap-1 rounded-tile border border-dashed border-border px-3.5 py-3">
      <Text testID="coach-error" accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">
        {copy}
      </Text>
      {error.retryable ? (
        <Button
          testID="coach-retry-button"
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={waiting}
          onPress={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </View>
  );
}
