import type { CoachModelProvider } from './model/provider';
import { UnconfiguredProvider } from './model/provider';
import { ollamaProviderFromEnv } from './model/ollama';
import { anthropicProviderFromEnv } from './model/anthropic';
import { ExpoPushSender, NoopPushSender, PushSender } from './push';

/**
 * The whole coach is behind COACH_ENABLED, default OFF. The default engine is a
 * model served by a local Ollama, so health data stays on this machine; the
 * hosted engine is opt-in per user behind its own consent (see getHostedProvider).
 * Read per request (not at import) so it can be toggled without a restart in tests.
 */
export function isCoachEnabled(): boolean {
  const v = process.env.COACH_ENABLED?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

// The local provider slot, the default engine for every user. The hosted
// engine (below) is a separate, opt-in slot; when a hosted answer fails, that
// message falls back to this one (engine.ts), never the other way round.
//
// COACH_PROVIDER selects it: `ollama` is a model served by a local Ollama
// (model/ollama.ts; loopback-only unless OLLAMA_ALLOW_REMOTE=true, so health
// data stays on this machine); anything else, or unset, is the unconfigured
// provider and every answer is a model_unavailable error card. Built once, on
// first use. A bad Ollama configuration is logged and degrades to the
// unconfigured provider rather than crashing the server.
let overrideProvider: CoachModelProvider | null = null;
let envProvider: CoachModelProvider | null = null;

function providerFromEnv(): CoachModelProvider {
  if (process.env.COACH_PROVIDER?.trim().toLowerCase() !== 'ollama') return new UnconfiguredProvider();
  try {
    const provider = ollamaProviderFromEnv();
    console.log(JSON.stringify({ event: 'coach.provider_configured', provider: provider.id }));
    return provider;
  } catch (err) {
    console.error(JSON.stringify({ event: 'coach.provider_config_invalid', error: err instanceof Error ? err.message : 'unknown' }));
    return new UnconfiguredProvider();
  }
}

export function getCoachProvider(): CoachModelProvider {
  if (overrideProvider) return overrideProvider;
  return (envProvider ??= providerFromEnv());
}

/** Explicit provider override (tests, evals). Pass null to go back to COACH_PROVIDER. */
export function setCoachProvider(provider: CoachModelProvider | null): void {
  overrideProvider = provider;
}

/** Forget the env-built provider so the next call re-reads COACH_PROVIDER / OLLAMA_* (tests). */
export function resetCoachProviderFromEnv(): void {
  envProvider = null;
}

// The answer budgets live in budgets.ts (the hosted provider reads them too); re-exported here.
export { HOSTED_ANSWER_BUDGET_MS, LOCAL_ANSWER_BUDGET_MS, getAnswerBudgetMs } from './budgets';

export const DEFAULT_SUMMARY_CONCURRENCY = 1;
export const MAX_SUMMARY_CONCURRENCY = 8;

/**
 * How many day summaries one process writes at once (COACH_SUMMARY_CONCURRENCY,
 * default 1, clamped to 1-8). Each is a full model generation, so on one Mac
 * running the local model they are best written one after another.
 */
export function getSummaryConcurrency(): number {
  const n = Number(process.env.COACH_SUMMARY_CONCURRENCY?.trim() || NaN);
  if (!Number.isFinite(n)) return DEFAULT_SUMMARY_CONCURRENCY;
  return Math.min(MAX_SUMMARY_CONCURRENCY, Math.max(1, Math.floor(n)));
}

// The hosted engine (spec 2026-09-30 section 3): Claude through the Anthropic
// SDK, offered only when COACH_HOSTED_ENABLED is true AND ANTHROPIC_API_KEY is
// set. Both are read per call, like COACH_ENABLED, so switching the flag off
// takes effect on the next message; the provider itself is built once.
let envHostedProvider: CoachModelProvider | null = null;

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/** The hosted provider, or null when the hosted engine is not offered. */
export function getHostedProvider(): CoachModelProvider | null {
  if (!envFlag('COACH_HOSTED_ENABLED') || !process.env.ANTHROPIC_API_KEY?.trim()) return null;
  if (envHostedProvider) return envHostedProvider;
  try {
    envHostedProvider = anthropicProviderFromEnv();
    console.log(JSON.stringify({ event: 'coach.hosted_provider_configured', provider: envHostedProvider.id }));
    return envHostedProvider;
  } catch (err) {
    console.error(JSON.stringify({ event: 'coach.hosted_provider_config_invalid', error: err instanceof Error ? err.name : 'unknown' }));
    return null;
  }
}

export function isHostedEngineAvailable(): boolean {
  return getHostedProvider() !== null;
}

/** Forget the env-built hosted provider so the next call re-reads ANTHROPIC_API_KEY / COACH_HOSTED_MODEL (tests). */
export function resetHostedProviderFromEnv(): void {
  envHostedProvider = null;
}

// The push slot. PUSH_PROVIDER=expo selects the Expo sender; anything else (the
// default) is the no-op sender, which delivers nothing. Push content is generic
// by construction (push.ts). Read per call, like COACH_ENABLED, so tests can
// switch it; setPushSender() is an explicit override that wins over the env.
let overrideSender: PushSender | null = null;
const noopSender = new NoopPushSender();
let expoSender: ExpoPushSender | null = null;

/** True when PUSH_PROVIDER selects the Expo push service. */
export function isExpoPushProvider(): boolean {
  return process.env.PUSH_PROVIDER?.trim().toLowerCase() === 'expo';
}

export function getPushSender(): PushSender {
  if (overrideSender) return overrideSender;
  if (isExpoPushProvider()) return (expoSender ??= new ExpoPushSender());
  return noopSender;
}

/** Explicit sender override (tests). Pass null to fall back to PUSH_PROVIDER. */
export function setPushSender(sender: PushSender | null): void {
  overrideSender = sender;
}
