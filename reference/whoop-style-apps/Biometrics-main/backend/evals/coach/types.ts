// Eval harness types (spec 2026-09-30, section 7). A fixture is (user data
// snapshot, question, scripted model output) plus what must be true of the run.
// It runs through the REAL answer pipeline (answer/pipeline.ts) with a
// ScriptedStreamProvider: the real router, fact sheet, prompt, sentence
// validator, card resolver and memory checks. A change to any of them that
// breaks a fixture fails CI (tests/coach/evals.test.ts) and `npm run eval:coach`.
//
// Besides the checks a fixture asks for, the runner ALWAYS checks that every
// sentence shown and every card value is grounded in the fact sheet (the
// `grounded` check), independently of the pipeline's own validation.

import type { AnswerEvent } from '../../src/coach/answer/pipeline';
import type { AnswerRoute } from '../../src/coach/answer/route';
import type { MemoryCategory } from '../../src/coach/memory';
import type { StreamStep } from '../../src/coach/model/provider';
import type { QualityExpectation } from './qualityCheck';

export type Direction = 'higher' | 'lower' | 'unchanged';

export type ReadingType = 'SLEEP' | 'HRV' | 'RESTING_HR' | 'STEPS';

/** Everything is keyed by days ago (0 = today, in the user's civil time). */
export interface UserSnapshot {
  /** The character; omitted means the default (Mochi). */
  personaId?: string;
  recovery?: Array<[daysAgo: number, score: number]>;
  sleepScore?: Array<[daysAgo: number, score: number]>;
  /** Raw readings: SLEEP in minutes, HRV in ms, RESTING_HR in bpm, STEPS as a count. */
  readings?: Partial<Record<ReadingType, Array<[daysAgo: number, value: number]>>>;
  pendingMemories?: Array<{ category: MemoryCategory; value: string }>;
  confirmedMemories?: Array<{ category: MemoryCategory; value: string }>;
}

export type FixtureCategory =
  | 'numbers'
  | 'hedged'
  | 'general'
  | 'card'
  | 'voice'
  | 'direction'
  | 'attribution'
  | 'quality'
  | 'memory'
  | 'safety'
  | 'errors';

export type Outcome = 'answer' | 'safety' | `error:${Extract<AnswerEvent, { type: 'error' }>['code']}`;

export interface CardExpectation {
  /** Fact ids of the tiles, in order (the tiles variant). */
  tiles?: string[];
  /** Fact ids of the ranked rows, in order (the ranked variant). */
  ranked?: string[];
  /** Labels shown on the tiles or rows, in order. */
  labels?: string[];
  /** Statuses shown on the tiles or rows, in order ('' for none): pins the literal app output. */
  statuses?: string[];
  /** Differences from usual shown on the tiles or rows, in order ('' for none), e.g. "−32 points". */
  deltas?: string[];
  /** Whether a tip survived validation. */
  tip?: boolean;
  /** The source line, which the app sets from the route (the model's is ignored). */
  source?: string;
}

export interface FixtureExpectation {
  outcome: Outcome;
  /** The route the question was sent down (from the status event). */
  route?: AnswerRoute;
  /** How many times the model was called (a regeneration is a second call). */
  modelCalls?: number;
  /** The exact validated sentences shown, in order. */
  sentences?: string[];
  /** Substrings that must appear in the shown text. */
  textPresent?: string[];
  /** Substrings that must NOT appear in the shown text. */
  textAbsent?: string[];
  /** Reasons of the dropped sentences, in order. Omit to not check; [] means none. */
  dropped?: Array<'unknown_number' | 'disallowed_topic' | 'stock_question'>;
  /** The card: null for no card. Every card value is always checked against the fact sheet. */
  card?: CardExpectation | null;
  /** Substrings the system prompt must contain: the character's voice, the facts. */
  promptIncludes?: string[];
  /** Substrings the system prompt must NOT contain. */
  promptExcludes?: string[];
  /** Directional words in the reply must agree with this fact's value against its usual. */
  directionOf?: string;
  /** Every number in a sentence that names one metric must belong to that metric's facts. */
  attribution?: boolean;
  /** The owner's quality bar: answer first, name the drivers, a concrete step in words, no stock check-in. */
  quality?: QualityExpectation;
  /** Exact memory values in the database after the answer, by status. */
  memory?: { pending?: string[]; confirmed?: string[] };
}

export interface EvalFixture {
  id: string;
  category: FixtureCategory;
  description: string;
  snapshot: UserSnapshot;
  question: string;
  /** The model's output, one step per model call. */
  script: StreamStep[];
  expect: FixtureExpectation;
}

/** Names of the checks the runner performs; a failure is reported against one of these. */
export type CheckName =
  | 'outcome'
  | 'route'
  | 'modelCalls'
  | 'sentences'
  | 'textPresent'
  | 'textAbsent'
  | 'dropped'
  | 'card'
  | 'grounded'
  | 'prompt'
  | 'direction'
  | 'attribution'
  | 'quality'
  | 'memory'
  | 'run_error';

export interface CheckFailure {
  check: CheckName;
  message: string;
}

export interface FixtureResult {
  id: string;
  category: FixtureCategory;
  passed: boolean;
  failures: CheckFailure[];
  /** The shown text. Kept for debugging; never logged by the CLI. */
  text: string;
}

/** A fixture that MUST fail, and on which check: proves the eval catches that class of error. */
export interface NegativeFixture extends EvalFixture {
  mustFailCheck: CheckName;
  /**
   * Runs the pipeline with its sentence validation switched off, so what the
   * model wrote reaches the checks unfiltered: proves the eval's own `grounded`
   * check catches an invented number even if the runtime check regressed.
   */
  unguarded?: boolean;
  /**
   * Other checks this fixture is known to fail as well, e.g. `grounded` for an
   * unguarded reply the runtime check would also have dropped. The fixture is
   * caught only when the named check fails and nothing outside these does.
   */
  alsoFails?: CheckName[];
}
