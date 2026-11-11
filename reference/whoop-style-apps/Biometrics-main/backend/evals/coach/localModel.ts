// `npm run eval:coach:local`: runs the eval fixtures' (snapshot, question)
// pairs through the REAL answer pipeline with the local Ollama provider (built
// from OLLAMA_* env, exactly as the server builds it) and reports, per fixture,
// what a real model did: outcome, time to the first sentence, total time,
// dropped sentences, whether a card came back, and whether everything shown is
// grounded in the fact sheet (and, where the fixture asks, whether its
// direction agrees, whether each number sits on its own metric, and whether it
// meets the quality bar: answer first, name the drivers, a step in words, no
// stock check-in). Scripted outputs in the fixtures are ignored. The model is
// warmed first, so the timings are the warm ones the spec targets (first
// sentence within 6 s on the owner's Mac).
//
// Env: OLLAMA_MODEL (required) and the other OLLAMA_* settings; EVAL_BUDGET_MS
// (default: the local answer budget, COACH_LOCAL_BUDGET_MS or 45000);
// EVAL_IDS (comma list); EVAL_LIMIT; EVAL_OUT (jsonl path).
// DATABASE_URL must name a *_test database: each fixture seeds and deletes a user.
//
// Output quotes model replies to fixture questions about seeded fixture data;
// no real user's data is ever read. This calls a real model, so it is never
// part of the jest suite (tests/coach/evals.test.ts runs the scripted fixtures).

import * as fs from 'fs';
import { buildFactSheet, defaultFactData } from '../../src/coach/answer/facts';
import { AnswerEvent, runAnswer, STEP_LABELS } from '../../src/coach/answer/pipeline';
import { AnswerRoute } from '../../src/coach/answer/route';
import { validateSentence } from '../../src/coach/answer/validate';
import { getAnswerBudgetMs } from '../../src/coach/config';
import { ollamaProviderFromEnv } from '../../src/coach/model/ollama';
import { prisma } from '../../src/db/client';
import { checkAttribution } from './attributionCheck';
import { checkDirectionalClaims, directionOf } from './directionCheck';
import { FIXTURES } from './fixtures';
import { checkQuality } from './qualityCheck';
import { cleanupUser, seedSnapshot, todayCivil } from './seed';

if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  console.error('refusing to run: DATABASE_URL must name a *_test database');
  process.exit(2);
}

const BUDGET = Number(process.env.EVAL_BUDGET_MS ?? getAnswerBudgetMs('local'));
const OUT = process.env.EVAL_OUT;
const ROUTE_OF_LABEL = new Map<string, AnswerRoute>(Object.entries(STEP_LABELS).map(([route, labels]) => [labels.route, route as AnswerRoute]));

interface Row {
  id: string;
  question: string;
  outcome: string;
  firstSentenceMs: number | null;
  totalMs: number;
  sentences: number;
  dropped: number;
  card: boolean;
  grounded: boolean;
  directionOk: boolean | null;
  attributionOk: boolean;
  /** Quality problems: the fixture's quality expectation, plus noStockCheckIn on every answered reply. */
  quality: string[];
  /** Every failed check, one line each: grounded, direction, attribution, quality. */
  failures: Array<{ check: 'grounded' | 'direction' | 'attribution' | 'quality'; message: string }>;
  endsWithQuestion: boolean;
  text: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main(): Promise<number> {
  const provider = ollamaProviderFromEnv();
  const ids = process.env.EVAL_IDS ? new Set(process.env.EVAL_IDS.split(',')) : null;
  const fixtures = FIXTURES.filter((f) => f.category !== 'safety' && f.category !== 'errors') // those paths never reach the model
    .filter((f) => (ids ? ids.has(f.id) : true))
    .slice(0, Number(process.env.EVAL_LIMIT ?? 1000));
  if (OUT) fs.writeFileSync(OUT, '');
  console.log(`provider=${provider.id} fixtures=${fixtures.length} budget=${BUDGET}ms`);
  const warmStarted = Date.now();
  await provider.warm();
  console.log(`warm-up ${Date.now() - warmStarted}ms`);

  const rows: Row[] = [];
  for (const fx of fixtures) {
    const { userId, conversationId } = await seedSnapshot(fx.snapshot);
    const t0 = Date.now();
    try {
      const events: AnswerEvent[] = [];
      let firstSentenceMs: number | null = null;
      let dropped = 0;
      const answer = runAnswer(
        { userId, message: fx.question, history: [], conversationId },
        {
          provider,
          engine: 'local',
          budgetMs: BUDGET,
          telemetry: { emit: (e) => void (e.name === 'coach.answer_sentence_dropped' && dropped++) },
        },
      );
      for await (const e of answer) {
        if (e.type === 'text' && firstSentenceMs === null) firstSentenceMs = Date.now() - t0;
        events.push(e);
      }
      const totalMs = Date.now() - t0;
      const sentences = events.flatMap((e) => (e.type === 'text' ? [e.sentence] : []));
      const text = sentences.join(' ');
      const status = events.find((e): e is Extract<AnswerEvent, { type: 'status' }> => e.type === 'status' && e.step === 'route');
      const route = (status && ROUTE_OF_LABEL.get(status.label)) ?? 'today';
      const sheet = await buildFactSheet(userId, route, { ...defaultFactData, today: todayCivil() });
      const error = events.find((e): e is Extract<AnswerEvent, { type: 'error' }> => e.type === 'error');
      const directionFact = fx.expect.directionOf ? sheet.facts.find((f) => f.id === fx.expect.directionOf) : undefined;
      const grounded = directionFact ? directionOf(directionFact) : null;
      const failures: Row['failures'] = [];
      for (const s of sentences) if (!validateSentence(s, sheet).ok) failures.push({ check: 'grounded', message: `not grounded: ${JSON.stringify(s)}` });
      const direction = grounded ? checkDirectionalClaims(text, grounded) : null;
      if (direction && !direction.ok) {
        failures.push({ check: 'direction', message: `${fx.expect.directionOf} is ${grounded} but the reply says ${direction.contradictions.map((c) => `"${c.word}"`).join(', ')}` });
      }
      const attribution = checkAttribution(sentences, sheet);
      for (const p of attribution.problems) failures.push({ check: 'attribution', message: `${JSON.stringify(p.sentence)} uses a number that is not one of the ${p.metric} facts` });
      // A real model's reply is held to the no-stock-check-in bar whatever the fixture asks.
      const quality = error ? [] : checkQuality(sentences, sheet, { ...fx.expect.quality, noStockCheckIn: true });
      for (const q of quality) failures.push({ check: 'quality', message: q });
      const row: Row = {
        id: fx.id,
        question: fx.question,
        outcome: error ? `error:${error.code}` : 'answer',
        firstSentenceMs,
        totalMs,
        sentences: sentences.length,
        dropped,
        card: events.some((e) => e.type === 'card'),
        grounded: !failures.some((f) => f.check === 'grounded'),
        directionOk: direction ? direction.ok : null,
        attributionOk: attribution.ok,
        quality,
        failures,
        endsWithQuestion: text.trim().endsWith('?'),
        text,
      };
      rows.push(row);
      if (OUT) fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
      console.log(
        `${row.outcome.padEnd(24)} first=${String(firstSentenceMs ?? '-').padStart(6)}ms total=${String(totalMs).padStart(6)}ms ` +
          `sentences=${row.sentences} dropped=${dropped} card=${row.card ? 'y' : 'n'}  ${fx.id}`,
      );
      console.log(`        Q: ${fx.question}`);
      console.log(`        A: ${text || '(nothing shown)'}`);
      for (const f of failures) console.log(`        - ${f.check}: ${f.message}`);
    } catch (err) {
      rows.push({ id: fx.id, outcome: 'crash', firstSentenceMs: null, totalMs: Date.now() - t0, sentences: 0, dropped: 0, card: false, question: fx.question, grounded: true, directionOk: null, attributionOk: true, quality: [], failures: [], endsWithQuestion: false, text: '' });
      console.log(`crash ${err instanceof Error ? err.name : 'unknown'}  ${fx.id}`);
    } finally {
      await cleanupUser(userId);
    }
  }

  const answered = rows.filter((r) => r.outcome === 'answer');
  const first = answered.flatMap((r) => (r.firstSentenceMs === null ? [] : [r.firstSentenceMs])).sort((a, b) => a - b);
  const total = answered.map((r) => r.totalMs).sort((a, b) => a - b);
  const checked = answered.filter((r) => r.directionOk !== null);
  console.log(`\nanswered ${answered.length}/${rows.length}, with a dropped sentence ${rows.filter((r) => r.dropped > 0).length}, with a card ${rows.filter((r) => r.card).length}`);
  console.log(`grounded ${answered.filter((r) => r.grounded).length}/${answered.length} (must be all: anything else is a validator bug)`);
  console.log(`direction ok ${checked.filter((r) => r.directionOk).length}/${checked.length} (the checker over-flags free prose; read the flagged ones)`);
  console.log(`attribution ok ${answered.filter((r) => r.attributionOk).length}/${answered.length}`);
  console.log(`quality ok ${answered.filter((r) => r.quality.length === 0).length}/${answered.length} (lexicon checks, no stock check-in on every reply; read the flagged ones)`);
  console.log(`ends with a question ${answered.filter((r) => r.endsWithQuestion).length}/${answered.length} (a question back is optional: most replies need none)`);
  console.log(`first sentence: median ${percentile(first, 50)} p90 ${percentile(first, 90)} max ${first[first.length - 1] ?? 0} ms (target: 6000 or less, warm)`);
  console.log(`full answer:    median ${percentile(total, 50)} p90 ${percentile(total, 90)} max ${total[total.length - 1] ?? 0} ms`);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : 'eval_failed');
    await prisma.$disconnect();
    process.exit(1);
  });
