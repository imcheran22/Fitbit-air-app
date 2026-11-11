import React from 'react';
import { Badge } from './badge';
import type { ConfidenceLevel } from '../../api/scores';

const CONFIDENCE: Record<ConfidenceLevel, { text: string; variant: 'accent' | 'muted' | 'destructive' }> = {
  HIGH: { text: 'High confidence', variant: 'accent' },
  MEDIUM: { text: 'Medium confidence', variant: 'muted' },
  LOW: { text: 'Low confidence', variant: 'destructive' },
};

// Surfaces DailyScore.confidenceLevel every time a score is shown: a score
// built from imputed or renormalised-around data says so in words, not just
// colour.
export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const { text, variant } = CONFIDENCE[level];
  return (
    <Badge testID="confidence-badge" accessibilityLabel={text} variant={variant}>
      {text}
    </Badge>
  );
}
