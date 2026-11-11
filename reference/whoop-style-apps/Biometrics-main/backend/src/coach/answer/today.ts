// The Coach page's picture of today (spec 2026-09-30 sections 1.2 and 4): four
// "today vs usual" bars and one sentence. The bars and the template sentence
// are built from the `today` fact sheet by code, so they are always available
// and always agree with each other; the AI sentence is an optional upgrade
// written by the user's engine and validated like a reply.

import type { Prisma } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../../biometrics/civilDate';
import { prisma } from '../../db/client';
import { CoachClock, systemClock, TimerHandle } from '../clock';
import { getAnswerBudgetMs, getCoachProvider, getHostedProvider, isCoachEnabled } from '../config';
import { hasCurrentConsent } from '../consent';
import { EngineSelection, selectEngine } from '../engine';
import type { CoachModelProvider } from '../model/provider';
import { CoachPersona, resolvePersona } from '../personas';
import { escapeField } from '../escape';
import type { CoachTelemetry } from '../telemetry';
import type { CardStatus } from './card';
import { statusOf } from './card';
import type { Fact, FactSheet, FactUnit } from './facts';
import { buildFactSheet, defaultFactData, formatValue, renderFactSheet } from './facts';
import { parseModelOutput } from './parse';
import { disallowedTopics } from './prompt';
import { sentenceSplitter } from './sentences';
import { validateSentence } from './validate';

export type TodayMetric = 'recovery' | 'sleep' | 'hrv' | 'rhr';

/** The fact-sheet ids the bars read (phase 1's `today` route must emit these). */
export const TODAY_FACT_IDS: Record<TodayMetric, string> = {
  recovery: 'recovery.today',
  sleep: 'sleep.total',
  hrv: 'hrv.today',
  rhr: 'rhr.today',
};

const METRICS: TodayMetric[] = ['recovery', 'sleep', 'hrv', 'rhr'];
const LABELS: Record<TodayMetric, string> = { recovery: 'Recovery', sleep: 'Sleep', hrv: 'HRV', rhr: 'Resting HR' };
/** How a metric is named mid-sentence. */
const MID_SENTENCE: Record<TodayMetric, string> = { recovery: 'recovery', sleep: 'sleep', hrv: 'HRV', rhr: 'resting HR' };

export interface TodaySpan {
  text: string;
  metric?: TodayMetric;
}

export interface TodaySentence {
  text: string;
  spans: TodaySpan[];
}

export interface TodayBar {
  metric: TodayMetric;
  label: string;
  value: number;
  usual: number | null;
  unit: FactUnit;
  display: string;
  usualDisplay: string | null;
  status: CardStatus | null;
  scaleMax: number;
}

export interface TodaySummaryDTO {
  date: string;
  hasData: boolean;
  sentence: (TodaySentence & { source: 'ai' | 'template' }) | null;
  bars: TodayBar[];
}

function factFor(sheet: FactSheet, metric: TodayMetric): Fact | undefined {
  return sheet.facts.find((f) => f.id === TODAY_FACT_IDS[metric]);
}

/**
 * Recovery 0-100; the others 0 -> 1.4 x the larger of value and usual, rounded
 * up to a whole unit, and never below 1 (the client divides by it).
 */
function scaleFor(metric: TodayMetric, value: number, usual: number | null): number {
  if (metric === 'recovery') return 100;
  return Math.max(1, Math.ceil(1.4 * Math.max(value, usual ?? value)));
}

export function buildBars(sheet: FactSheet): TodayBar[] {
  const bars: TodayBar[] = [];
  for (const metric of METRICS) {
    const fact = factFor(sheet, metric);
    if (!fact) continue;
    // A recovery score of 0 is real; 0 sleep, HRV or resting HR is a missing reading.
    if (metric !== 'recovery' && fact.value === 0) continue;
    // A usual of 0 is no usual: no tick, no "0 ms", no comparison.
    const usual = fact.usual ? fact.usual : null;
    bars.push({
      metric,
      label: LABELS[metric],
      value: fact.value,
      usual,
      unit: fact.unit,
      display: fact.display,
      usualDisplay: usual === null ? null : formatValue(fact.unit, usual),
      status: usual === null ? null : (statusOf(fact) ?? null),
      scaleMax: scaleFor(metric, fact.value, usual),
    });
  }
  return bars;
}

function relativeGap(bar: TodayBar): number {
  return bar.usual ? Math.abs(bar.value - bar.usual) / Math.abs(bar.usual) : 0;
}

/** "Sleep", "Sleep and HRV", "Sleep, HRV and resting HR". */
function nameList(bars: TodayBar[]): string {
  const names = bars.map((b, i) => (i === 0 ? LABELS[b.metric] : MID_SENTENCE[b.metric]));
  if (names.length === 1) return `${names[0]} is close to usual.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are both close to usual.`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are all close to usual.`;
}

/**
 * "Recovery {v}, {below|near|above} your usual {u}. {largest driver sentence}."
 * The driver is the metric furthest from its usual, preferring one that moved
 * the same way as recovery (it is the likely "why").
 */
export function templateSentence(sheet: FactSheet): TodaySentence {
  const bars = buildBars(sheet);
  if (bars.length === 0) return { text: '', spans: [] };
  const spans: TodaySpan[] = [];
  const lead = bars[0]!;

  if (lead.metric === 'recovery' && lead.usual !== null && lead.status !== null) {
    spans.push({ text: `Recovery ${lead.display}`, metric: 'recovery' }, { text: `, ${lead.status} your usual ${lead.usualDisplay}.` });
  } else {
    spans.push({ text: `${lead.label} ${lead.display}`, metric: lead.metric }, { text: ' today.' });
  }

  const others = bars.slice(1).filter((b) => b.usual !== null && b.usual !== 0 && b.status !== null);
  const moved = others.filter((b) => b.status !== 'near');
  const sameWay = lead.metric === 'recovery' && lead.status !== 'near' ? moved.filter((b) => b.status === lead.status) : [];
  const pool = sameWay.length > 0 ? sameWay : moved;
  const driver = pool.reduce<TodayBar | null>((best, b) => (best === null || relativeGap(b) > relativeGap(best) ? b : best), null);

  if (driver) {
    const lower = driver.value < driver.usual!;
    const word = driver.metric === 'sleep' ? (lower ? 'shorter' : 'longer') : lower ? 'lower' : 'higher';
    spans[spans.length - 1]!.text += ' ';
    spans.push(
      { text: `${driver.label} ${driver.display}`, metric: driver.metric },
      { text: ` is ${word} than your usual ${driver.usualDisplay}.` },
    );
  } else if (others.length > 0) {
    spans[spans.length - 1]!.text += ` ${nameList(others)}`;
  }
  return { text: spans.map((s) => s.text).join(''), spans };
}

const METRIC_WORDS: Array<[TodayMetric, RegExp]> = [
  ['recovery', /\brecovery\b/i],
  ['sleep', /\b(sleep|sleeping|slept|asleep|nights?)\b/i],
  ['hrv', /\b(HRV|heart rate variability)\b/i],
  // Only resting heart rate: a bare "heart rate" may be max or average heart rate, or HRV spelled out.
  ['rhr', /\b(resting heart rate|resting HR|rest HR)\b/i],
];

/** Tappable spans for a model-written sentence: the first mention of each metric. */
export function spansFor(text: string): TodaySpan[] {
  const hits = METRIC_WORDS.map(([metric, re]) => {
    const m = re.exec(text);
    return m ? { metric, start: m.index, end: m.index + m[0].length } : null;
  })
    .filter((h): h is { metric: TodayMetric; start: number; end: number } => h !== null)
    .sort((a, b) => a.start - b.start);

  const spans: TodaySpan[] = [];
  let at = 0;
  for (const hit of hits) {
    if (hit.start < at) continue; // overlaps an earlier mention
    if (hit.start > at) spans.push({ text: text.slice(at, hit.start) });
    spans.push({ text: text.slice(hit.start, hit.end), metric: hit.metric });
    at = hit.end;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

// ---- the stored sentence ------------------------------------------------------

export const SUMMARY_MAX_WORDS = 45;
const SUMMARY_MAX_TOKENS = 300;
export const TODAY_REQUEST = "Write today's summary for the top of my Coach page.";

export type SummaryRejection = 'empty' | 'too_long' | 'cut_off' | 'unknown_number' | 'disallowed_topic';
/** Why a run stored the template instead of an AI sentence (telemetry only; never shown). */
export type SummaryFailure = SummaryRejection | 'model_unavailable' | 'timeout';

const CORRECTIVE: Record<SummaryRejection, string> = {
  empty: 'Your last draft was empty. Write the summary now.',
  cut_off: 'Your last draft stopped mid-sentence. Write it again, complete and a little shorter.',
  too_long: `Your last draft was too long. Keep it to ${SUMMARY_MAX_WORDS} words or fewer.`,
  unknown_number:
    'Your last draft used a number that is not in the facts. Use only numbers exactly as they appear in the facts, or none.',
  disallowed_topic:
    'Your last draft touched a topic you must not discuss. Stay with what the numbers show and one everyday suggestion.',
};

export interface TodayDeps {
  /** The `today` fact sheet for the user's local day. Default: buildFactSheet(userId, 'today', { ...defaultFactData, today }). */
  loadSheet?: (userId: string, today: string) => Promise<FactSheet>;
  now?: () => Date;
  /** The engine that writes the sentence. Default: the user's engine, hosted falling back to local. */
  selectProvider?: (userId: string) => Promise<EngineSelection>;
  clock?: CoachClock;
  /** Default: the selected engine's answer budget (COACH_LOCAL_BUDGET_MS / COACH_HOSTED_BUDGET_MS). */
  budgetMs?: number;
  /** getTodaySummary only: called when today has data but no sentence has been written for it yet. */
  onMissing?: () => void;
  /** generateTodaySummary only: replace a sentence already stored for today (the after-sync job). */
  force?: boolean;
  /** generateTodaySummary only: receives coach.summary_failed (reason and engine; never text). */
  telemetry?: CoachTelemetry;
}

export type SummaryOutcome =
  | 'ai'
  | 'template'
  | 'skipped_disabled'
  | 'skipped_no_consent'
  | 'skipped_no_data'
  | 'skipped_exists'
  | 'skipped_persona_changed';

export interface SummaryEngineSlots {
  getProvider: () => CoachModelProvider;
  getHostedProvider: () => CoachModelProvider | null;
  clock: CoachClock;
  telemetry: CoachTelemetry;
}

/**
 * The day summary's engine, clock and telemetry, built the same way for the
 * HTTP routes and the after-sync job: the engine the user's messages go to
 * (hosted only while chosen, offered and consented; hosted falls back to local).
 */
export function summaryEngineDeps(slots: SummaryEngineSlots): TodayDeps {
  return {
    clock: slots.clock,
    telemetry: slots.telemetry,
    selectProvider: (userId) => selectEngine(userId, { local: slots.getProvider(), hosted: slots.getHostedProvider() }),
  };
}

const defaultLoadSheet = (userId: string, today: string) => buildFactSheet(userId, 'today', { ...defaultFactData, today });
const defaultSelect = (userId: string) => selectEngine(userId, { local: getCoachProvider(), hosted: getHostedProvider() });

async function loadUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, coachPersonaId: true } });
}

/**
 * Validates a model draft like a reply: fenced blocks dropped, at most
 * SUMMARY_MAX_WORDS words, every sentence through validateSentence (numbers
 * only from the fact sheet, no disallowed topic).
 */
export function checkSummary(
  raw: string,
  sheet: FactSheet,
): { ok: true; text: string } | { ok: false; reason: SummaryRejection } {
  // A max-token cutoff can leave the start of a fence ("``") that parseModelOutput does not see as one.
  const text = parseModelOutput(raw)
    .reply.replace(/`+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.split(' ').length > SUMMARY_MAX_WORDS) return { ok: false, reason: 'too_long' };
  // No closing punctuation (after any trailing emoji or markdown emphasis): the model was cut off mid-sentence.
  const ending = text.replace(/[\s*_\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u, '');
  if (!/[.!?…]["'”’)]*$/.test(ending)) return { ok: false, reason: 'cut_off' };
  const splitter = sentenceSplitter();
  for (const sentence of [...splitter.push(text), ...splitter.end()]) {
    const verdict = validateSentence(sentence, sheet);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
  }
  return { ok: true, text };
}

export function buildTodaySummaryPrompt(persona: CoachPersona, sheet: FactSheet, today: string): string {
  return [
    `You are ${escapeField(persona.name)}, the user's companion coach in a health app.`,
    `Your tone: ${escapeField(persona.tone)}`,
    ...(persona.focus ? [`Your coaching focus: ${escapeField(persona.focus)}`] : []),
    `Today is ${today}.`,
    '',
    "Write the one short paragraph shown at the top of the user's Coach page, in this order:",
    "1. What happened: last night's sleep and today's recovery, HRV or resting heart rate against your usual.",
    '2. Why: the most likely reason, taken from a factor.* or habit.* fact when there is one (say what it is in plain words, never the id).',
    '3. One concrete thing the user can do today, small enough to actually do.',
    'Say the suggestion in words, never with a new number or time: "an early night", not "bed by 10:15".',
    'Be specific to these numbers; never write a generic line that could fit any day.',
    `At most ${SUMMARY_MAX_WORDS} words, in your own voice, speaking to the user as "you".`,
    'Use only numbers that appear in the facts below, written the same way; never estimate or invent one. If a fact is missing, do not mention it.',
    `Never give a medical diagnosis or medication or supplement advice. Topics you never discuss: ${disallowedTopics(persona).map((t) => escapeField(t)).join(', ')}.`,
    'Plain sentences only: no list, no heading, no question, no code or card block.',
    '',
    'Facts:',
    renderFactSheet(sheet),
  ].join('\n');
}

type Written = { text: string } | { failure: SummaryFailure };

/**
 * The budget for a summary run. A hosted selection may fall back to the local
 * model mid-run, so it gets the larger of the two budgets.
 */
function budgetFor(selection: EngineSelection): number {
  const local = getAnswerBudgetMs('local');
  return selection.requested === 'hosted' ? Math.max(getAnswerBudgetMs('hosted'), local) : local;
}

/** One draft, then one corrective regeneration, all within the budget. */
async function writeSentence(
  selection: EngineSelection,
  persona: CoachPersona,
  sheet: FactSheet,
  today: string,
  deps: TodayDeps,
): Promise<Written> {
  const clock = deps.clock ?? systemClock;
  const budget = deps.budgetMs ?? budgetFor(selection);
  const controller = new AbortController();
  const system = buildTodaySummaryPrompt(persona, sheet, today);

  async function attempts(): Promise<Written> {
    let note: string | null = null;
    let rejected: SummaryRejection = 'empty';
    for (let attempt = 1; attempt <= 2; attempt++) {
      let raw = '';
      for await (const chunk of selection.provider.stream({
        system,
        messages: [{ role: 'user', content: note ? `${TODAY_REQUEST}\n\n${note}` : TODAY_REQUEST }],
        maxTokens: SUMMARY_MAX_TOKENS,
        signal: controller.signal,
      })) {
        raw += chunk;
      }
      if (controller.signal.aborted) return { failure: 'timeout' };
      const verdict = checkSummary(raw, sheet);
      if (verdict.ok) return { text: verdict.text };
      rejected = verdict.reason;
      note = CORRECTIVE[verdict.reason];
    }
    return { failure: rejected };
  }

  let timer: TimerHandle | undefined;
  const deadline = new Promise<Written>((resolve) => {
    timer = clock.setTimer(() => {
      controller.abort();
      resolve({ failure: 'timeout' });
    }, budget);
  });
  try {
    return await Promise.race([
      attempts().catch((): Written => ({ failure: controller.signal.aborted ? 'timeout' : 'model_unavailable' })),
      deadline,
    ]);
  } finally {
    timer?.cancel();
  }
}

async function generate(userId: string, deps: TodayDeps): Promise<SummaryOutcome> {
  if (!isCoachEnabled()) return 'skipped_disabled';
  if (!(await hasCurrentConsent(userId))) return 'skipped_no_consent';
  const user = await loadUser(userId);
  if (!user) return 'skipped_no_data';

  const today = localCivilDateOrUtc((deps.now ?? (() => new Date()))(), user.timezone);
  const where = { userId_date: { userId, date: civilDateToUtcMidnight(today) } };
  if (!deps.force && (await prisma.coachDaySummary.findUnique({ where, select: { id: true } }))) return 'skipped_exists';

  const sheet = await (deps.loadSheet ?? defaultLoadSheet)(userId, today);
  if (buildBars(sheet).length === 0) return 'skipped_no_data';

  const persona = resolvePersona(user.coachPersonaId);
  const selection = await (deps.selectProvider ?? defaultSelect)(userId);
  const written = await writeSentence(selection, persona, sheet, today, deps);
  const text = 'text' in written ? written.text : null;

  // A character switch while the model was writing: this sentence is in the old voice.
  if (await personaChanged(userId, persona)) return 'skipped_persona_changed';
  if ('failure' in written) {
    deps.telemetry?.emit({
      name: 'coach.summary_failed',
      userId,
      personaId: persona.id,
      attributes: { reason: written.failure, engine: selection.servedBy() },
    });
  }

  const row =
    text !== null
      ? { text, spans: spansFor(text), source: 'AI' as const }
      : { ...templateSentence(sheet), source: 'TEMPLATE' as const };
  const data = { text: row.text, spans: row.spans as unknown as Prisma.InputJsonValue, source: row.source };
  let stored: { id: string; createdAt: Date };
  try {
    stored = await prisma.coachDaySummary.upsert({
      where,
      create: { userId, date: civilDateToUtcMidnight(today), ...data },
      update: { ...data, createdAt: new Date() },
      select: { id: true, createdAt: true },
    });
  } catch (err) {
    // Another instance wrote today's row first; theirs stands.
    if ((err as { code?: string } | null)?.code === 'P2002') return 'skipped_exists';
    throw err;
  }
  // The character changed between the check above and the write: take this row back (only while it
  // is still ours), so the rewrite the switch asked for writes in the new voice.
  if (await personaChanged(userId, persona)) {
    await prisma.coachDaySummary.deleteMany({ where: { id: stored.id, createdAt: stored.createdAt } });
    return 'skipped_persona_changed';
  }
  return text !== null ? 'ai' : 'template';
}

async function personaChanged(userId: string, persona: CoachPersona): Promise<boolean> {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { coachPersonaId: true } });
  return resolvePersona(current?.coachPersonaId).id !== persona.id;
}

const wroteRow = (outcome: SummaryOutcome | null) => outcome === 'ai' || outcome === 'template';

interface FollowUp {
  force: boolean;
  deps: TodayDeps;
  promise: Promise<SummaryOutcome>;
}

interface UserRuns {
  current: Promise<SummaryOutcome>;
  /** At most one run waits behind the current one; every later caller shares it. */
  followUp: FollowUp | null;
}

const runs = new Map<string, UserRuns>();

function startRun(userId: string, state: UserRuns, deps: TodayDeps): Promise<SummaryOutcome> {
  state.current = generate(userId, deps).finally(() => {
    if (!state.followUp && runs.get(userId) === state) runs.delete(userId);
  });
  return state.current;
}

/**
 * Writes today's sentence with the user's engine and stores it (AI), or stores
 * the template (TEMPLATE) when no draft passed validation in time, so a failing
 * model is not retried on every page load.
 *
 * One run per user at a time in this process. A caller that arrives while a
 * run is in flight gets one queued follow-up run, shared by every later
 * caller so a burst still collapses, which starts once the current run ends:
 * - when any of them forces (the after-sync job), the follow-up rewrites from
 *   the sheet as it is then, so the stored sentence never predates the sync;
 * - otherwise it reuses the current run's result when that run stored a row,
 *   and runs again when it did not (the character changed mid-run, so the
 *   follow-up writes in the new voice).
 */
export function generateTodaySummary(userId: string, deps: TodayDeps = {}): Promise<SummaryOutcome> {
  const state = runs.get(userId);
  if (!state) {
    const fresh: UserRuns = { current: Promise.resolve('skipped_exists'), followUp: null };
    runs.set(userId, fresh);
    return startRun(userId, fresh, deps);
  }
  if (state.followUp) {
    state.followUp.force ||= !!deps.force;
    return state.followUp.promise;
  }
  const followUp: FollowUp = { force: !!deps.force, deps, promise: Promise.resolve('skipped_exists') };
  followUp.promise = state.current
    .catch(() => null)
    .then((first) => {
      state.followUp = null;
      if (!followUp.force && wroteRow(first)) {
        if (runs.get(userId) === state) runs.delete(userId);
        return first!;
      }
      return startRun(userId, state, { ...followUp.deps, force: followUp.force });
    });
  state.followUp = followUp;
  return followUp.promise;
}

/**
 * GET /me/coach/today. Bars and the template are computed live from the fact
 * sheet, so the page never waits on a model; only a stored AI sentence
 * replaces the template.
 */
export async function getTodaySummary(userId: string, deps: TodayDeps = {}): Promise<TodaySummaryDTO> {
  const user = await loadUser(userId);
  const date = localCivilDateOrUtc((deps.now ?? (() => new Date()))(), user?.timezone ?? 'UTC');
  const sheet = await (deps.loadSheet ?? defaultLoadSheet)(userId, date);
  const bars = buildBars(sheet);
  if (bars.length === 0) return { date, hasData: false, sentence: null, bars };

  const stored = await prisma.coachDaySummary.findUnique({
    where: { userId_date: { userId, date: civilDateToUtcMidnight(date) } },
  });
  if (stored?.source === 'AI') {
    return {
      date,
      hasData: true,
      sentence: { text: stored.text, spans: stored.spans as unknown as TodaySpan[], source: 'ai' },
      bars,
    };
  }
  if (!stored) deps.onMissing?.();
  return { date, hasData: true, sentence: { ...templateSentence(sheet), source: 'template' }, bars };
}

/** Drops today's stored sentence (the character changed), so the page shows the template until a new one is written. */
export async function clearTodaySummary(userId: string, deps: Pick<TodayDeps, 'now'> = {}): Promise<void> {
  const user = await loadUser(userId);
  const date = localCivilDateOrUtc((deps.now ?? (() => new Date()))(), user?.timezone ?? 'UTC');
  await prisma.coachDaySummary.deleteMany({ where: { userId, date: civilDateToUtcMidnight(date) } });
}
