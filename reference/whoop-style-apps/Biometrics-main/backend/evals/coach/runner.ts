// Eval runner (spec 2026-09-30, section 7): seeds a fixture's user snapshot,
// runs the fixture's question through the REAL answer pipeline with a
// ScriptedStreamProvider (no network, no model), and checks the events, the
// system prompt, the fact sheet and the database against the fixture.
//
// Two suites:
//   FIXTURES           every one must pass.
//   NEGATIVE_FIXTURES  every one must FAIL, on the check it names and no other:
//                      they prove the eval catches a class of error the runtime
//                      cannot (a contradicted direction, a number pinned on the
//                      wrong metric, an answer that buries the point) or would
//                      miss if its own check regressed (an invented number, with
//                      the runtime check switched off).

import { deltaDisplayOf, statusOf } from '../../src/coach/answer/card';
import { buildFactSheet, defaultFactData, FactSheet } from '../../src/coach/answer/facts';
import { AnswerEvent, runAnswer, STEP_LABELS } from '../../src/coach/answer/pipeline';
import { AnswerRoute, routeQuestion } from '../../src/coach/answer/route';
import { validateSentence } from '../../src/coach/answer/validate';
import { CoachClock } from '../../src/coach/clock';
import { ScriptedStreamProvider } from '../../src/coach/model/provider';
import { CoachEvent, CoachTelemetry } from '../../src/coach/telemetry';
import { prisma } from '../../src/db/client';
import { checkAttribution } from './attributionCheck';
import { checkDirectionalClaims, directionOf } from './directionCheck';
import { checkQuality } from './qualityCheck';
import { cleanupUser, seedSnapshot, todayCivil } from './seed';
import type { CheckFailure, EvalFixture, FixtureResult, NegativeFixture, Outcome } from './types';

/** Never fires: the eval is deterministic and must not depend on wall-clock timers. */
const inertClock: CoachClock = { now: () => Date.now(), setTimer: () => ({ cancel: () => {} }) };

class CollectingTelemetry implements CoachTelemetry {
  events: CoachEvent[] = [];
  emit(event: CoachEvent): void {
    this.events.push(event);
  }
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const show = (list: readonly string[]) => `[${list.map((s) => JSON.stringify(s)).join(', ')}]`;

const ROUTE_OF_LABEL = new Map<string, AnswerRoute>(Object.entries(STEP_LABELS).map(([route, labels]) => [labels.route, route as AnswerRoute]));

function outcomeOf(events: readonly AnswerEvent[]): Outcome | 'none' {
  for (const e of events) {
    if (e.type === 'safety') return 'safety';
    if (e.type === 'error') return `error:${e.code}`;
  }
  return events.some((e) => e.type === 'done') ? 'answer' : 'none';
}

/** Every shown sentence and every card value must be grounded in the fact sheet. */
function groundedFailures(sentences: readonly string[], card: Extract<AnswerEvent, { type: 'card' }>['card'] | null, sheet: FactSheet): string[] {
  const out: string[] = [];
  for (const s of sentences) if (!validateSentence(s, sheet).ok) out.push(`shown sentence is not grounded in the fact sheet: ${JSON.stringify(s)}`);
  if (card) {
    const facts = new Map(sheet.facts.map((f) => [f.id, f]));
    for (const item of [...(card.tiles ?? []), ...(card.ranked ?? [])]) {
      const fact = facts.get(item.factId);
      if (!fact) out.push(`card row ${item.factId} is not on the fact sheet`);
      else if (item.display !== fact.display || item.value !== fact.value) out.push(`card row ${item.factId} does not show the fact sheet's value`);
      else if (item.usual !== fact.usual || item.status !== statusOf(fact) || item.deltaDisplay !== deltaDisplayOf(fact)) {
        out.push(`card row ${item.factId} does not show the fact sheet's usual, status or difference`);
      }
    }
    for (const text of [card.headline, card.tip ?? '']) {
      if (text && !validateSentence(text, sheet).ok) out.push(`card text is not grounded in the fact sheet: ${JSON.stringify(text)}`);
    }
  }
  return out;
}

export async function runFixture(fixture: EvalFixture, options: { unguarded?: boolean } = {}): Promise<FixtureResult> {
  const failures: CheckFailure[] = [];
  const fail = (check: CheckFailure['check'], message: string) => failures.push({ check, message });
  let text = '';
  const { userId, conversationId } = await seedSnapshot(fixture.snapshot);
  try {
    const provider = new ScriptedStreamProvider(fixture.script);
    const telemetry = new CollectingTelemetry();
    const events: AnswerEvent[] = [];
    const answer = runAnswer(
      { userId, message: fixture.question, history: [], conversationId },
      {
        provider,
        engine: 'local',
        telemetry,
        clock: inertClock,
        ...(options.unguarded ? { validate: () => ({ ok: true as const }) } : {}),
      },
    );
    for await (const e of answer) events.push(e);

    const sentences = events.flatMap((e) => (e.type === 'text' ? [e.sentence] : []));
    text = sentences.join(' ');
    const card = events.find((e): e is Extract<AnswerEvent, { type: 'card' }> => e.type === 'card')?.card ?? null;
    const status = events.find((e): e is Extract<AnswerEvent, { type: 'status' }> => e.type === 'status' && e.step === 'route');
    const route = status ? ROUTE_OF_LABEL.get(status.label) : undefined;
    const sheet = await buildFactSheet(userId, route ?? routeQuestion(fixture.question), { ...defaultFactData, today: todayCivil() });
    const want = fixture.expect;

    const outcome = outcomeOf(events);
    if (outcome !== want.outcome) fail('outcome', `expected ${want.outcome}, got ${outcome}`);
    if (want.route !== undefined && route !== want.route) fail('route', `expected the ${want.route} route, got ${route ?? 'none'}`);
    if (want.modelCalls !== undefined && provider.callCount !== want.modelCalls) {
      fail('modelCalls', `expected ${want.modelCalls} model calls, got ${provider.callCount}`);
    }
    if (want.sentences && !sameList(sentences, want.sentences)) fail('sentences', `expected ${show(want.sentences)}, got ${show(sentences)}`);
    for (const v of want.textPresent ?? []) if (!text.includes(v)) fail('textPresent', `reply is missing ${JSON.stringify(v)}`);
    for (const v of want.textAbsent ?? []) if (text.includes(v)) fail('textAbsent', `reply contains the forbidden text ${JSON.stringify(v)}`);
    if (want.dropped) {
      const seen = telemetry.events.filter((e) => e.name === 'coach.answer_sentence_dropped').map((e) => String(e.attributes.reason));
      if (!sameList(seen, want.dropped)) fail('dropped', `expected dropped ${show(want.dropped)}, got ${show(seen)}`);
    }
    if (want.card !== undefined) {
      if (want.card === null) {
        if (card) fail('card', `expected no card, got one headed ${JSON.stringify(card.headline)}`);
      } else if (!card) {
        fail('card', 'expected a card, got none');
      } else {
        const rows = card.tiles ?? card.ranked ?? [];
        if (want.card.tiles && !(card.tiles && sameList(card.tiles.map((t) => t.factId), want.card.tiles))) {
          fail('card', `expected tiles ${show(want.card.tiles)}, got ${card.tiles ? show(card.tiles.map((t) => t.factId)) : 'none'}`);
        }
        if (want.card.ranked && !(card.ranked && sameList(card.ranked.map((r) => r.factId), want.card.ranked))) {
          fail('card', `expected ranked rows ${show(want.card.ranked)}, got ${card.ranked ? show(card.ranked.map((r) => r.factId)) : 'none'}`);
        }
        if (want.card.labels && !sameList(rows.map((r) => r.label), want.card.labels)) {
          fail('card', `expected labels ${show(want.card.labels)}, got ${show(rows.map((r) => r.label))}`);
        }
        const statuses = rows.map((r) => r.status ?? '');
        if (want.card.statuses && !sameList(statuses, want.card.statuses)) fail('card', `expected statuses ${show(want.card.statuses)}, got ${show(statuses)}`);
        const deltas = rows.map((r) => r.deltaDisplay ?? '');
        if (want.card.deltas && !sameList(deltas, want.card.deltas)) fail('card', `expected differences ${show(want.card.deltas)}, got ${show(deltas)}`);
        if (want.card.tip !== undefined &&(card.tip !== undefined) !== want.card.tip) fail('card', `expected ${want.card.tip ? 'a' : 'no'} tip`);
        if (want.card.source !== undefined && card.source !== want.card.source) {
          fail('card', `expected source ${JSON.stringify(want.card.source)}, got ${JSON.stringify(card.source)}`);
        }
      }
    }
    for (const g of groundedFailures(sentences, card, sheet)) fail('grounded', g);
    const system = provider.requests[0]?.system ?? '';
    for (const p of want.promptIncludes ?? []) if (!system.includes(p)) fail('prompt', `system prompt is missing ${JSON.stringify(p)}`);
    for (const p of want.promptExcludes ?? []) if (system.includes(p)) fail('prompt', `system prompt contains ${JSON.stringify(p)}`);
    if (want.directionOf) {
      const fact = sheet.facts.find((f) => f.id === want.directionOf);
      const grounded = fact ? directionOf(fact) : null;
      if (!grounded) {
        fail('direction', `the fact sheet has no ${want.directionOf} with a usual to check against`);
      } else {
        const check = checkDirectionalClaims(text, grounded);
        if (!check.ok) {
          fail('direction', `${want.directionOf} is ${grounded} than usual but the reply says ${check.contradictions.map((c) => `"${c.word}"`).join(', ')}`);
        }
      }
    }
    if (want.attribution) {
      for (const p of checkAttribution(sentences, sheet).problems) {
        fail('attribution', `${JSON.stringify(p.sentence)} uses a number that is not one of the ${p.metric} facts`);
      }
    }
    if (want.quality) for (const q of checkQuality(sentences, sheet, want.quality)) fail('quality', q);
    if (want.memory) {
      const rows = await prisma.coachMemory.findMany({ where: { userId }, select: { value: true, status: true } });
      const byStatus = (s: string) => rows.filter((r) => r.status === s).map((r) => r.value).sort();
      if (want.memory.pending && !sameList(byStatus('PENDING'), [...want.memory.pending].sort())) {
        fail('memory', `expected pending ${show(want.memory.pending)}, got ${show(byStatus('PENDING'))}`);
      }
      if (want.memory.confirmed && !sameList(byStatus('CONFIRMED'), [...want.memory.confirmed].sort())) {
        fail('memory', `expected confirmed ${show(want.memory.confirmed)}, got ${show(byStatus('CONFIRMED'))}`);
      }
    }
  } catch (err) {
    fail('run_error', err instanceof Error ? err.name : 'unknown');
  } finally {
    await cleanupUser(userId);
  }
  return { id: fixture.id, category: fixture.category, passed: failures.length === 0, failures, text };
}

export async function runFixtures(fixtures: readonly EvalFixture[]): Promise<FixtureResult[]> {
  const out: FixtureResult[] = [];
  for (const f of fixtures) out.push(await runFixture(f));
  return out;
}

export interface NegativeResult {
  id: string;
  mustFailCheck: NegativeFixture['mustFailCheck'];
  /** True when the fixture failed on the named check and on nothing else (besides its declared alsoFails). */
  caught: boolean;
  failures: CheckFailure[];
}

export async function runNegativeFixtures(fixtures: readonly NegativeFixture[]): Promise<NegativeResult[]> {
  const out: NegativeResult[] = [];
  for (const f of fixtures) {
    const result = await runFixture(f, { unguarded: f.unguarded === true });
    const allowed = new Set([f.mustFailCheck, ...(f.alsoFails ?? [])]);
    out.push({
      id: f.id,
      mustFailCheck: f.mustFailCheck,
      caught: result.failures.some((x) => x.check === f.mustFailCheck) && result.failures.every((x) => allowed.has(x.check)),
      failures: result.failures,
    });
  }
  return out;
}

export interface EvalReport {
  ok: boolean;
  results: FixtureResult[];
  negatives: NegativeResult[];
}

export async function runEval(fixtures: readonly EvalFixture[], negatives: readonly NegativeFixture[]): Promise<EvalReport> {
  const results = await runFixtures(fixtures);
  const negativeResults = await runNegativeFixtures(negatives);
  return {
    ok: results.every((r) => r.passed) && negativeResults.every((n) => n.caught),
    results,
    negatives: negativeResults,
  };
}
