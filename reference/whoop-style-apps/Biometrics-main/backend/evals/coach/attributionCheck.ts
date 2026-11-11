// Number-attribution checker. The runtime validator (answer/validate.ts)
// scopes a number to the metrics its sentence names, score drivers and notes
// included since the final review (I2), so "your HRV is 9", where 9 is the
// points HRV cost the recovery score, is dropped at runtime. This check is the
// backstop for that class (every number real, but pinned on the wrong metric)
// should the runtime scoping regress: a sentence that
// names exactly one metric may only use numbers from that metric's own facts
// (same tolerance, units and hedging rules as the runtime check, which it
// reuses on a sheet cut down to that metric). Which metrics a sentence names is
// read by the runtime's own namedMetrics, so "night", "nights" and "asleep"
// count as sleep exactly as they do there (and "last night" does not).
// Sentences naming no metric or several are not judged. Only run on fixtures
// that opt in.

import type { FactSheet } from '../../src/coach/answer/facts';
import { extractNumbers, Metric, namedMetrics, validateSentence } from '../../src/coach/answer/validate';

/** Each metric's name in reports and the facts its numbers may come from (the sleep score may use sleep durations, as at runtime). */
const METRICS: Record<Metric, { name: string; factPrefixes: string[] }> = {
  recovery: { name: 'recovery', factPrefixes: ['recovery.'] },
  sleep_score: { name: 'sleep score', factPrefixes: ['sleep_score.', 'sleep.'] },
  hrv: { name: 'hrv', factPrefixes: ['hrv.'] },
  rhr: { name: 'resting heart rate', factPrefixes: ['rhr.'] },
  sleep: { name: 'sleep', factPrefixes: ['sleep.'] },
  steps: { name: 'steps', factPrefixes: ['steps.'] },
};

export interface AttributionProblem {
  sentence: string;
  metric: string;
}

export function checkAttribution(sentences: readonly string[], sheet: FactSheet): { ok: boolean; problems: AttributionProblem[] } {
  const problems: AttributionProblem[] = [];
  for (const sentence of sentences) {
    const named = [...namedMetrics(sentence)];
    if (named.length !== 1 || extractNumbers(sentence).length === 0) continue;
    const metric = METRICS[named[0]!];
    const own: FactSheet = {
      route: 'today', // never the general route: no general-knowledge allowance here
      facts: sheet.facts.filter((f) => metric.factPrefixes.some((p) => f.id.startsWith(p))),
      notes: [],
    };
    if (!validateSentence(sentence, own).ok) problems.push({ sentence, metric: metric.name });
  }
  return { ok: problems.length === 0, problems };
}
