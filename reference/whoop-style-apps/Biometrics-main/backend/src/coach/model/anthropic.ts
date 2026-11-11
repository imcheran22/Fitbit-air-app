// backend/src/coach/model/anthropic.ts
// The hosted coach model: Claude, through the official Anthropic SDK (spec
// 2026-09-30 section 3). Opt-in per user, behind COACH_HOSTED_ENABLED and a
// separate HOSTED consent; the local model stays the default.
//
// Request shape (claude-opus-5-5):
// - no `thinking` field: thinking is always on for this model, and sending
//   {type:'disabled'} or a budget_tokens value is a 400. `output_config.effort`
//   is the control; 'low' keeps a coach answer quick and cheap.
// - no temperature/top_p/top_k (non-default sampling parameters are rejected).
// - server-side refusal fallback on: `fallbacks: 'default'` under the
//   `server-side-fallback-2026-07-01` beta, on the BETA messages endpoint. A
//   classifier decline is re-run on Anthropic's recommended fallback model in
//   the same call; only a refusal of the whole chain reaches us, as
//   stop_reason 'refusal', and is thrown as HostedRefusalError so the caller can
//   answer locally instead.
// - max_tokens 2000: thinking counts toward it, so it is sized well above the
//   ~300-500 token answer.
// - time to first text: COACH_HOSTED_FIRST_TEXT_MS (default 10 s). A stream with
//   no text by then is cancelled on the provider's OWN signal (the caller's is
//   left alone) and fails with HostedTimeoutError, so the engine's local fallback
//   still has most of the answer budget for a cold local load.
//
// Only the system prompt (persona + fact sheet) and the windowed conversation
// are ever sent; no user id, email or name has a path into a request.

import Anthropic from '@anthropic-ai/sdk';
import { getAnswerBudgetMs, logClampOnce } from '../budgets';
import { CoachClock, systemClock } from '../clock';
import type { CoachModelProvider, CoachStreamRequest } from './provider';

export const DEFAULT_HOSTED_MODEL = 'claude-opus-5-5';
export const HOSTED_MAX_TOKENS = 2000;
export const HOSTED_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const DEFAULT_HOSTED_FIRST_TEXT_MS = 10_000;
const MIN_HOSTED_FIRST_TEXT_MS = 1_000;
const MAX_HOSTED_FIRST_TEXT_MS = 60_000;

/**
 * COACH_HOSTED_FIRST_TEXT_MS, clamped to 1 s - min(60 s, half of
 * COACH_HOSTED_BUDGET_MS); unset or not a number means the 10 s default (under
 * the same cap). What is left of the hosted budget is what the local fallback
 * gets, so the cap always leaves it at least half.
 */
export function getHostedFirstTextMs(): number {
  const max = Math.min(MAX_HOSTED_FIRST_TEXT_MS, Math.floor(getAnswerBudgetMs('hosted') / 2));
  const raw = process.env.COACH_HOSTED_FIRST_TEXT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  const ms = Number.isFinite(n) ? Math.round(n) : DEFAULT_HOSTED_FIRST_TEXT_MS;
  const clamped = Math.min(max, Math.max(MIN_HOSTED_FIRST_TEXT_MS, ms));
  if (Number.isFinite(n) && clamped !== ms) logClampOnce('COACH_HOSTED_FIRST_TEXT_MS', clamped);
  return clamped;
}

/** The hosted model produced no text within the time-to-first-text limit. */
export class HostedTimeoutError extends Error {
  constructor(ms: number) {
    super(`The hosted model produced no text within ${ms} ms`);
    this.name = 'HostedTimeoutError';
  }
}

/** The hosted model (and any fallback model) declined the request. */
export class HostedRefusalError extends Error {
  constructor() {
    super('The hosted model declined the request');
    this.name = 'HostedRefusalError';
  }
}

export class HostedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostedConfigError';
  }
}

export interface AnthropicProviderOptions {
  /** The SDK client, or the slice of it this provider uses. Injected in tests. */
  client: Pick<Anthropic, 'beta'>;
  model?: string | undefined;
  /** Time to first text before the stream is dropped. Defaults to getHostedFirstTextMs(). */
  firstTextTimeoutMs?: number;
  /** Timer source for the first-text timeout. Injected in tests. */
  clock?: CoachClock;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * The Messages API wants a non-empty text per turn and a user turn first. The
 * history window can start on an assistant reply, and an interrupted reply can
 * be stored empty, so both are dropped here rather than sent as a 400.
 */
export function toAnthropicMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.content.trim().length === 0) continue;
    if (out.length === 0 && m.role !== 'user') continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export class AnthropicProvider implements CoachModelProvider {
  readonly id: string;
  private readonly client: Pick<Anthropic, 'beta'>;
  private readonly model: string;
  private readonly firstTextTimeoutMs: number;
  private readonly clock: CoachClock;

  constructor(options: AnthropicProviderOptions) {
    this.client = options.client;
    this.model = options.model?.trim() || DEFAULT_HOSTED_MODEL;
    this.firstTextTimeoutMs = options.firstTextTimeoutMs ?? getHostedFirstTextMs();
    this.clock = options.clock ?? systemClock;
    this.id = `anthropic:${this.model}`;
  }

  private params(system: string, messages: ChatMessage[]) {
    return {
      model: this.model,
      max_tokens: HOSTED_MAX_TOKENS,
      system,
      messages,
      output_config: { effort: 'low' as const },
      betas: [HOSTED_FALLBACK_BETA],
      fallbacks: 'default' as const,
    };
  }

  async *stream(request: CoachStreamRequest): AsyncIterable<string> {
    // The first-text timeout cancels the call on its own controller, combined with
    // the caller's signal: the caller's signal stays un-aborted, so the engine reads
    // the timeout as a hosted failure (and answers locally), not as a stop.
    const firstText = new AbortController();
    const timer = this.clock.setTimer(() => firstText.abort(), this.firstTextTimeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, firstText.signal]) : firstText.signal;
    try {
      const stream = this.client.beta.messages.stream(
        this.params(request.system, toAnthropicMessages(request.messages)),
        { signal },
      );
      let yielded = false;
      for await (const event of stream) {
        // A server-side fallback hands the turn to another model mid-response; the
        // declining model's earlier output stays in the stream. Before any text went
        // out that is invisible (the fallback model's answer streams normally); after
        // it, appending a second answer to a shown fragment would garble the reply,
        // so stop here. Leaving the loop by throwing aborts the SDK stream.
        if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
          if (yielded) throw new HostedRefusalError();
          continue;
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (event.delta.text.trim().length > 0) timer.cancel();
          yielded = true;
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new HostedRefusalError();
    } catch (err) {
      if (firstText.signal.aborted && !request.signal?.aborted) throw new HostedTimeoutError(this.firstTextTimeoutMs);
      throw err;
    } finally {
      timer.cancel();
    }
  }
}

/** Builds the provider from ANTHROPIC_API_KEY / COACH_HOSTED_MODEL. Throws HostedConfigError without a key. */
export function anthropicProviderFromEnv(): AnthropicProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new HostedConfigError('ANTHROPIC_API_KEY is required for the hosted coach engine');
  return new AnthropicProvider({
    // One retry: the answer budget (COACH_HOSTED_BUDGET_MS) bounds the whole call anyway.
    client: new Anthropic({ apiKey, maxRetries: 1 }),
    model: process.env.COACH_HOSTED_MODEL?.trim() || undefined,
  });
}
