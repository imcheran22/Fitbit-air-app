// The coach's recap text (spec 2026-10-04 §2): a 1–2 sentence line on every recap and, for a
// week, the story that replaces the weekly digest. Written by the user's engine. Every sentence
// passes validateSentence(…, { exactNumbers: true }); a rejected draft gets one retry with a
// corrective note, then the template. The whole recap shares one 60 s budget; a provider that
// ignores the abort cannot outlast it (each draft races the deadline).

import type { FactSheet } from '../coach/answer/facts';
import { parseModelOutput } from '../coach/answer/parse';
import { buildRecapLinePrompt, buildRecapStoryPrompt, RECAP_LINE_MAX_WORDS } from '../coach/answer/prompt';
import { sentenceSplitter } from '../coach/answer/sentences';
import { validateSentence } from '../coach/answer/validate';
import { CoachClock, systemClock } from '../coach/clock';
import type { EngineSelection } from '../coach/engine';
import type { CoachPersona } from '../coach/personas';
import { composeRecapStoryFallback, templateLine } from './templates';
import type { RecapKind, RecapStats } from './types';

export const RECAP_BUDGET_MS = 60_000;
const LINE_MAX_TOKENS = 200;
const STORY_MAX_TOKENS = 500;
export const RECAP_LINE_REQUEST = 'Write the quote for my recap.';
export const RECAP_STORY_REQUEST = 'Write my weekly recap.';
const EXACT = { exactNumbers: true } as const;

export type TextSource = 'AI' | 'TEMPLATE';
export interface RecapText {
  line: string;
  lineSource: TextSource;
  story: string | null;
  storySource: TextSource | null;
}
export type DraftRejection = 'empty' | 'too_long' | 'unknown_number' | 'disallowed_topic';

/** The retry's note: names what was wrong, never quotes the rejected draft. */
const CORRECTIVE: Record<DraftRejection, string> = {
  empty: 'Your last draft was empty. Write it now.',
  too_long: `Your last draft was too long. Keep the quote to 2 sentences and ${RECAP_LINE_MAX_WORDS} words or fewer.`,
  unknown_number:
    'Your last draft used a number that is not in the facts. Use only numbers exactly as they appear in the facts, written as digits, or none.',
  disallowed_topic: 'Your last draft touched a topic you must not discuss. Stay with what the numbers show.',
};

/** The whole draft or nothing: fences dropped, limits checked, every sentence through the exact number check. */
export function checkDraft(
  raw: string,
  sheet: FactSheet,
  limits: { maxWords?: number; maxSentences?: number } = {},
): { ok: true; text: string } | { ok: false; reason: DraftRejection } {
  const text = parseModelOutput(raw).reply.replace(/`+\s*$/, '').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (limits.maxWords !== undefined && text.split(' ').length > limits.maxWords) return { ok: false, reason: 'too_long' };
  const splitter = sentenceSplitter();
  const sentences = [...splitter.push(text), ...splitter.end()];
  if (limits.maxSentences !== undefined && sentences.length > limits.maxSentences) return { ok: false, reason: 'too_long' };
  for (const sentence of sentences) {
    const verdict = validateSentence(sentence, sheet, EXACT);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
  }
  return { ok: true, text };
}

export interface RecapTextInput {
  userId: string;
  kind: RecapKind;
  stats: RecapStats;
  sheet: FactSheet;
  persona: CoachPersona;
  periodLabel: string;
  /** False when the coach is off, consent is not current or the persona is reactive-only: template line, no story. */
  aiAllowed: boolean;
}

export interface RecapTextDeps {
  selectProvider: (userId: string) => Promise<EngineSelection>;
  clock?: CoachClock;
  budgetMs?: number;
}

/** Up to two drafts: the first, then one retry carrying the corrective note. Null when neither passes. */
async function draft(
  selection: EngineSelection,
  system: string,
  request: string,
  maxTokens: number,
  sheet: FactSheet,
  limits: { maxWords?: number; maxSentences?: number },
  signal: AbortSignal,
): Promise<string | null> {
  let note: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal.aborted) return null;
    let raw = '';
    try {
      for await (const chunk of selection.provider.stream({
        system,
        messages: [{ role: 'user', content: note ? `${request}\n\n${note}` : request }],
        maxTokens,
        signal,
      })) {
        raw += chunk;
      }
    } catch {
      return null;
    }
    if (signal.aborted) return null;
    const verdict = checkDraft(raw, sheet, limits);
    if (verdict.ok) return verdict.text;
    note = CORRECTIVE[verdict.reason];
  }
  return null;
}

export async function writeRecapText(input: RecapTextInput, deps: RecapTextDeps): Promise<RecapText> {
  const fallbackLine = templateLine(input.kind, input.stats, input.sheet);
  if (!input.aiAllowed) return { line: fallbackLine, lineSource: 'TEMPLATE', story: null, storySource: null };

  const clock = deps.clock ?? systemClock;
  const controller = new AbortController();
  const deadline = new Promise<null>((resolve) => controller.signal.addEventListener('abort', () => resolve(null), { once: true }));
  const timer = clock.setTimer(() => controller.abort(), deps.budgetMs ?? RECAP_BUDGET_MS);
  const bounded = (p: Promise<string | null>) => Promise.race([p.catch((): null => null), deadline]);
  try {
    let selection: EngineSelection | null = null;
    try {
      selection = await deps.selectProvider(input.userId);
    } catch {
      selection = null;
    }
    const ctx = { kind: input.kind, periodLabel: input.periodLabel, sheet: input.sheet };
    const line = selection
      ? await bounded(
          draft(selection, buildRecapLinePrompt(input.persona, ctx), RECAP_LINE_REQUEST, LINE_MAX_TOKENS, input.sheet, { maxWords: RECAP_LINE_MAX_WORDS, maxSentences: 2 }, controller.signal),
        )
      : null;
    let story: string | null = null;
    let storySource: TextSource | null = null;
    if (input.kind === 'WEEK') {
      const ai = selection
        ? await bounded(draft(selection, buildRecapStoryPrompt(input.persona, ctx), RECAP_STORY_REQUEST, STORY_MAX_TOKENS, input.sheet, {}, controller.signal))
        : null;
      if (ai !== null) {
        story = ai;
        storySource = 'AI';
      } else {
        story = composeRecapStoryFallback(input.kind, input.stats, input.sheet);
        storySource = story === null ? null : 'TEMPLATE';
      }
    }
    return { line: line ?? fallbackLine, lineSource: line === null ? 'TEMPLATE' : 'AI', story, storySource };
  } finally {
    timer.cancel();
  }
}
