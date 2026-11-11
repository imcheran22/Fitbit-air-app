import { ApiError, apiFetch } from './client';
import {
  DEFAULT_THINKING_ATTACHMENT,
  DEFAULT_THINKING_TEXT,
  isThinkingAttachment,
  isThinkingText,
  type ThinkingAttachmentId,
  type ThinkingTextId,
} from '../components/characters/thinking';

// The client must wait strictly longer than the server's own budget, or a slow
// turn surfaces as a network error instead of the server's answer or error
// event. The server gives a local-model turn 45 s (COACH_LOCAL_BUDGET_MS) and a
// hosted one 30 s, so the client allows 60 s. A server running with a raised
// budget needs EXPO_PUBLIC_COACH_TIMEOUT_MS set above it.
export const DEFAULT_COACH_REQUEST_TIMEOUT_MS = 60_000;

export function coachTimeoutFromEnv(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : DEFAULT_COACH_REQUEST_TIMEOUT_MS;
}

export const COACH_REQUEST_TIMEOUT_MS = coachTimeoutFromEnv(process.env.EXPO_PUBLIC_COACH_TIMEOUT_MS);

export interface CoachPersonaDTO {
  id: string;
  name: string;
  verbosity: string;
  proactivity: string;
  // Picker copy for a companion character; null from a server that predates them.
  tagline: string | null;
  greeting: string | null;
}

export interface CoachConsentDTO {
  version: string;
  // Shown verbatim: this is the plain statement of what data leaves the device.
  summary: string;
  dataItems: string[];
}

export interface CoachStatusDTO {
  enabled: boolean;
  consented: boolean;
  consent: CoachConsentDTO;
  personaId: string;
  // False until the user has picked a character (Skip picks Mochi); the picker opens once.
  personaChosen: boolean;
  personas: CoachPersonaDTO[];
  // How the coach looks while it works on an answer. fetchCoachStatus always
  // fills both: a server that predates them, or an id this build does not
  // know, reads as the defaults ('bulb' / 'steps'). Optional, like engine, so
  // fixtures that predate them stay valid; read them from useCharacter().
  thinkingAttachment?: ThinkingAttachmentId;
  thinkingText?: ThinkingTextId;
  // Which model answers (phase 2). Optional so fixtures that predate engines
  // stay valid; fetchCoachStatus always fills both.
  engine?: CoachEngineDTO;
  engines?: CoachEnginesDTO;
}

// 'hosted' only while the server offers it and both the coach and the hosted
// consents are current; otherwise the server reports 'local'.
export type CoachEngineDTO = 'local' | 'hosted';

export interface HostedEngineDTO {
  // Offered by this server (COACH_HOSTED_ENABLED and a key configured).
  available: boolean;
  // The user holds a current HOSTED-scope consent.
  consented: boolean;
  // What the hosted consent screen shows; null when the server sent none.
  consent: CoachConsentDTO | null;
}

export interface CoachEnginesDTO {
  hosted: HostedEngineDTO;
}

export type FactUnitDTO = 'score' | 'ms' | 'bpm' | 'minutes' | 'count' | 'percent' | 'none';
export type CardStatusDTO = 'below' | 'near' | 'above';

export interface AnswerCardItemDTO {
  factId: string;
  label: string;
  display: string;
  value: number;
  usual?: number;
  status?: CardStatusDTO;
  // The signed difference from usual ("−25m", "+4 bpm"); absent on cards stored before it existed.
  deltaDisplay?: string;
}

// The answer card under a data answer (spec 1.3). The server fills every
// number from its fact sheet; the app only lays it out. The server sets the
// source line per route ("Today", "Last night and your past 7 nights",
// "Your last 30 days", "Your profile"), never the model.
export interface AnswerCardDTO {
  headline: string;
  tiles?: AnswerCardItemDTO[];
  ranked?: AnswerCardItemDTO[];
  tip?: string;
  source: string;
}

export type CoachErrorCode = 'model_unavailable' | 'timeout' | 'validation_failed' | 'consent_required' | 'internal';

// The answer pipeline's progress steps, in order, sent on `status` events.
export type CoachStepId = 'route' | 'facts' | 'write';

// One server-sent event from POST /me/coach/message (spec 2.5), as JSON.
export type CoachStreamEvent =
  // conversationId arrives before anything is stored (status, or safety for a crisis
  // message), so a first turn stopped or dropped before `done` keeps its conversation.
  // `step` names the pipeline step the label belongs to; absent from an older server.
  | { type: 'status'; label: string; step?: CoachStepId; conversationId?: string }
  | { type: 'text'; sentence: string }
  | { type: 'card'; card: AnswerCardDTO }
  | { type: 'memory'; proposals: MemoryDTO[] }
  | { type: 'safety'; text: string; resources: string[]; conversationId?: string }
  | { type: 'done'; messageId: string; conversationId: string; engine: CoachEngineDTO; durationMs: number; stopped?: boolean }
  | { type: 'error'; code: CoachErrorCode; retryable: boolean };

export type TodayMetric = 'recovery' | 'sleep' | 'hrv' | 'rhr';

export interface TodaySpanDTO {
  text: string;
  // Set on a span that is about one metric: underlined and tappable.
  metric?: TodayMetric;
}

// The server never sends a bar for a missing reading (0 sleep, HRV or resting
// HR); a usual of 0 arrives as null, with no usualDisplay and no status.
export interface TodayBarDTO {
  metric: TodayMetric;
  label: string;
  value: number;
  usual: number | null;
  unit: FactUnitDTO;
  display: string;
  usualDisplay: string | null;
  status: CardStatusDTO | null;
  scaleMax: number;
}

export interface TodaySummaryDTO {
  date: string;
  hasData: boolean;
  sentence: { text: string; spans: TodaySpanDTO[]; source: 'ai' | 'template' } | null;
  bars: TodayBarDTO[];
}

export interface CoachConversationSummaryDTO {
  id: string;
  // The conversation's first question, on one line, at most 60 characters.
  title: string;
  // ISO time; also the cursor for the next (older) page.
  lastMessageAt: string;
  messageCount?: number;
}

export type CoachMessageSource = 'model' | 'fallback' | 'safety';

export interface CoachMessageDTO {
  id: string;
  role: 'assistant';
  text: string;
  source: CoachMessageSource;
  createdAt: string;
}

export interface CoachSafetyDTO {
  resources: string[];
  canContinue: true;
}

// The closed allowlist of things the coach may remember (spec 5). Health and
// medical details are deliberately not a category.
export type MemoryCategory = 'TRAINING_GOAL' | 'SCHEDULE' | 'PREFERENCE';

export interface MemoryDTO {
  id: string;
  category: MemoryCategory;
  value: string;
  // PENDING: proposed this turn and kept unless the user corrects it.
  status: 'PENDING' | 'CONFIRMED';
  createdAt: string;
}

export interface CoachDigestDTO {
  id: string;
  text: string;
  createdAt: string;
}

export interface CoachReplyDTO {
  conversationId: string;
  message: CoachMessageDTO;
  safety?: CoachSafetyDTO;
  // Entries the coach proposed to remember on this turn.
  memoryProposals?: MemoryDTO[];
}

export interface CoachHistoryMessageDTO {
  id: string;
  // The server's messageDTO (backend/src/coach/routes.ts) always lowercases
  // the stored 'USER'/'ASSISTANT' enum before sending it; this must match
  // that shape exactly, or every restored message is misread as the coach's.
  role: 'user' | 'assistant';
  text: string;
  // null on user rows (the server stores no source for them).
  source?: string | null;
  createdAt: string;
  // Redesign history fields. Each is optional: rows stored before the
  // redesign render as plain talk. The server sends card/safety/engine as null
  // when absent, stopped as false and memoryProposals as [].
  card?: unknown;
  safety?: { resources?: unknown } | null;
  memoryProposals?: MemoryDTO[];
  engine?: CoachEngineDTO | null;
  stopped?: boolean;
}

export interface CoachConversationDTO {
  conversationId: string | null;
  messages: CoachHistoryMessageDTO[];
}

export interface SendCoachMessageInput {
  message: string;
  conversationId?: string;
  safetyOverride?: boolean;
}

// 403 { error: 'consent_required' }
export class CoachConsentRequiredError extends Error {
  constructor() {
    super('Coach consent is required');
    this.name = 'CoachConsentRequiredError';
    Object.setPrototypeOf(this, CoachConsentRequiredError.prototype);
  }
}

// 404 { error: 'coach_disabled' }
export class CoachDisabledError extends Error {
  constructor() {
    super('The coach is not available');
    this.name = 'CoachDisabledError';
    Object.setPrototypeOf(this, CoachDisabledError.prototype);
  }
}

// 409 { error: 'stale_consent_version' }: the consent text changed since the
// screen was loaded, so the user has not agreed to what is now in force.
export class StaleConsentVersionError extends Error {
  constructor() {
    super('The consent version is out of date');
    this.name = 'StaleConsentVersionError';
    Object.setPrototypeOf(this, StaleConsentVersionError.prototype);
  }
}

// A conversation the server no longer has (the daily retention job deletes
// transcripts past 90 days). The coach itself is fine: the caller should drop
// the stale id and start a new conversation rather than hide the whole screen.
export class StaleConversationError extends Error {
  constructor() {
    super('That conversation is no longer available');
    this.name = 'StaleConversationError';
    Object.setPrototypeOf(this, StaleConversationError.prototype);
  }
}

export class CoachTimeoutError extends Error {
  constructor() {
    super('The coach took too long to answer');
    this.name = 'CoachTimeoutError';
    Object.setPrototypeOf(this, CoachTimeoutError.prototype);
  }
}

// 404 { error: 'hosted_unavailable' } on PUT /me/coach/engine or a hosted-scope
// POST /me/coach/consent: this server does not offer the hosted model (any more).
export class HostedUnavailableError extends Error {
  constructor() {
    super('The hosted model is not available');
    this.name = 'HostedUnavailableError';
    Object.setPrototypeOf(this, HostedUnavailableError.prototype);
  }
}

// 409 { error: 'turn_in_progress' } on POST /me/coach/message: an answer for
// this user is still being written (another device, or a resend too soon).
export class TurnInProgressError extends Error {
  constructor() {
    super('The coach is still answering');
    this.name = 'TurnInProgressError';
    Object.setPrototypeOf(this, TurnInProgressError.prototype);
  }
}

// 429 { error: 'too_many_messages', retryAfterSeconds } on POST /me/coach/message:
// the per-user turn limit. retryAfterSeconds is undefined when the server sent none.
export class TooManyMessagesError extends Error {
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds?: number) {
    super('Too many messages, try again shortly');
    this.name = 'TooManyMessagesError';
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, TooManyMessagesError.prototype);
  }
}

// 400 on PATCH /me/coach/memory/:id: the new text failed server validation.
export class CoachMemoryValidationError extends Error {
  constructor() {
    super('That memory could not be saved');
    this.name = 'CoachMemoryValidationError';
    Object.setPrototypeOf(this, CoachMemoryValidationError.prototype);
  }
}

// 404 on PATCH/DELETE /me/coach/memory/:id: the entry no longer exists.
export class CoachMemoryNotFoundError extends Error {
  constructor() {
    super('That memory no longer exists');
    this.name = 'CoachMemoryNotFoundError';
    Object.setPrototypeOf(this, CoachMemoryNotFoundError.prototype);
  }
}

// Status alone is not enough for 404: the coach endpoints return it both for
// "coach is switched off" and for a conversationId the server has since deleted.
// Mapping both to CoachDisabledError hid the entire chat until app restart over
// a stale id. The server's `error` code separates them.
export function mapCoachError(error: unknown): unknown {
  if (error instanceof ApiError) {
    if (error.status === 403) return new CoachConsentRequiredError();
    if (error.status === 404) {
      if (error.code === 'conversation_not_found') return new StaleConversationError();
      if (error.code === 'hosted_unavailable') return new HostedUnavailableError();
      return new CoachDisabledError();
    }
    if (error.status === 409) {
      return error.code === 'turn_in_progress' ? new TurnInProgressError() : new StaleConsentVersionError();
    }
    if (error.status === 429 && error.code === 'too_many_messages') {
      const retryAfter = isRecord(error.body) ? error.body.retryAfterSeconds : undefined;
      return new TooManyMessagesError(typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined);
    }
  }
  return error;
}

async function coachFetch<T>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    throw mapCoachError(error);
  }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const LOCAL_ONLY: CoachEnginesDTO = { hosted: { available: false, consented: false, consent: null } };

const DISABLED_STATUS: CoachStatusDTO = {
  enabled: false,
  consented: false,
  consent: { version: '', summary: '', dataItems: [] },
  personaId: '',
  personaChosen: false,
  personas: [],
  engine: 'local',
  engines: LOCAL_ONLY,
  thinkingAttachment: DEFAULT_THINKING_ATTACHMENT,
  thinkingText: DEFAULT_THINKING_TEXT,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function consentDTO(raw: unknown): CoachConsentDTO | null {
  if (!isRecord(raw) || typeof raw.version !== 'string' || typeof raw.summary !== 'string') return null;
  const items = Array.isArray(raw.dataItems) ? raw.dataItems.filter((i): i is string => typeof i === 'string') : [];
  return { version: raw.version, summary: raw.summary, dataItems: items };
}

// Anything but a literal 'hosted' answers on the device, the safe default.
function enginesDTO(raw: unknown): CoachEnginesDTO {
  const hosted = isRecord(raw) && isRecord(raw.hosted) ? raw.hosted : null;
  if (!hosted) return LOCAL_ONLY;
  return { hosted: { available: hosted.available === true, consented: hosted.consented === true, consent: consentDTO(hosted.consent) } };
}

// A malformed status must fail closed: the coach stays invisible rather than
// half-rendering.
function personaDTO(p: Partial<CoachPersonaDTO>): CoachPersonaDTO {
  return {
    id: p.id ?? '',
    name: p.name ?? '',
    verbosity: p.verbosity ?? '',
    proactivity: p.proactivity ?? '',
    tagline: typeof p.tagline === 'string' ? p.tagline : null,
    greeting: typeof p.greeting === 'string' ? p.greeting : null,
  };
}

export async function fetchCoachStatus(): Promise<CoachStatusDTO> {
  const res = await coachFetch<Partial<CoachStatusDTO> | undefined>('/me/coach/status');
  if (!res || typeof res !== 'object' || Array.isArray(res)) return DISABLED_STATUS;
  // The character and the thinking settings are also the app's look, so they
  // are read even while the coach is off.
  const persona = {
    personaId: typeof res.personaId === 'string' ? res.personaId : '',
    // Only a literal false means "not chosen yet". A server that doesn't send
    // the field (it predates characters and can't store their ids) must never
    // prompt the picker, so anything else reads as chosen.
    personaChosen: res.personaChosen !== false,
    personas: Array.isArray(res.personas)
      ? res.personas.filter((p): p is CoachPersonaDTO => !!p && typeof p === 'object').map(personaDTO)
      : [],
    thinkingAttachment: isThinkingAttachment(res.thinkingAttachment) ? res.thinkingAttachment : DEFAULT_THINKING_ATTACHMENT,
    thinkingText: isThinkingText(res.thinkingText) ? res.thinkingText : DEFAULT_THINKING_TEXT,
  };
  if (res.enabled !== true) return { ...DISABLED_STATUS, ...persona };
  return {
    enabled: true,
    consented: res.consented === true,
    consent: {
      version: res.consent?.version ?? '',
      summary: res.consent?.summary ?? '',
      dataItems: res.consent?.dataItems ?? [],
    },
    ...persona,
    engine: res.engine === 'hosted' ? 'hosted' : 'local',
    engines: enginesDTO(res.engines),
  };
}

export function acceptCoachConsent(version: string): Promise<{ consented: true }> {
  return coachFetch<{ consented: true }>('/me/coach/consent', json('POST', { version }));
}

export async function revokeCoachConsent(): Promise<void> {
  await coachFetch<void>('/me/coach/consent', { method: 'DELETE' });
}

export function setCoachPersona(personaId: string): Promise<{ personaId: string }> {
  return coachFetch<{ personaId: string }>('/me/coach/persona', json('PUT', { personaId }));
}

// Sends only the settings given; the server answers with both as stored.
export function setCoachThinking(body: {
  attachment?: ThinkingAttachmentId;
  text?: ThinkingTextId;
}): Promise<{ thinkingAttachment: string; thinkingText: string }> {
  return coachFetch<{ thinkingAttachment: string; thinkingText: string }>('/me/coach/thinking', json('PUT', body));
}

export async function sendCoachMessage(input: SendCoachMessageInput): Promise<CoachReplyDTO> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced as well as aborted: abort cancels the socket, the race guarantees the
  // caller is released even if a layer below ignores the signal.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CoachTimeoutError());
    }, COACH_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      coachFetch<CoachReplyDTO>('/me/coach/message', { ...json('POST', input), signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLatestConversation(): Promise<CoachConversationDTO> {
  const res = await coachFetch<Partial<CoachConversationDTO> | undefined>('/me/coach/conversations/latest');
  return { conversationId: res?.conversationId ?? null, messages: res?.messages ?? [] };
}

export async function listCoachMemory(): Promise<MemoryDTO[]> {
  const res = await coachFetch<Partial<{ entries: MemoryDTO[] }> | undefined>('/me/coach/memory');
  return res?.entries ?? [];
}

// On an entry-level path a 404 means "that entry", not "coach disabled".
async function memoryEntryFetch<T>(path: string, options: Parameters<typeof apiFetch>[1]): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) throw new CoachMemoryValidationError();
      if (error.status === 404) throw new CoachMemoryNotFoundError();
    }
    throw mapCoachError(error);
  }
}

export async function updateCoachMemory(id: string, value: string): Promise<MemoryDTO> {
  const res = await memoryEntryFetch<{ entry: MemoryDTO }>(`/me/coach/memory/${encodeURIComponent(id)}`, json('PATCH', { value }));
  return res.entry;
}

export async function deleteCoachMemory(id: string): Promise<void> {
  await memoryEntryFetch<void>(`/me/coach/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchLatestDigest(): Promise<CoachDigestDTO | null> {
  const res = await coachFetch<Partial<{ digest: CoachDigestDTO | null }> | undefined>('/me/coach/digests/latest');
  return res?.digest ?? null;
}

// ---- coach redesign ----------------------------------------------------------

export function setCoachEngine(engine: CoachEngineDTO): Promise<{ engine: CoachEngineDTO }> {
  return coachFetch<{ engine: CoachEngineDTO }>('/me/coach/engine', json('PUT', { engine }));
}

export function grantHostedConsent(version: string): Promise<{ consented: true }> {
  return coachFetch<{ consented: true }>('/me/coach/consent', json('POST', { version, scope: 'hosted' }));
}

// Withdraws only the hosted opt-in; the coach consent stays. The server puts
// the engine back to on-device in the same transaction, so refetch status after.
export async function revokeHostedConsent(): Promise<void> {
  await coachFetch<void>('/me/coach/consent?scope=hosted', { method: 'DELETE' });
}

// Newest first, 20 per page; pass the last row's lastMessageAt for the next page.
export async function listConversations(before?: string): Promise<CoachConversationSummaryDTO[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await coachFetch<unknown>(`/me/coach/conversations${query}`);
  const rows = isRecord(res) && Array.isArray(res.conversations) ? res.conversations : [];
  return rows
    .filter((r): r is Record<string, unknown> => isRecord(r) && typeof r.id === 'string' && typeof r.lastMessageAt === 'string')
    .map((r) => ({
      id: r.id as string,
      title: typeof r.title === 'string' && r.title.trim() ? r.title : 'Conversation',
      lastMessageAt: r.lastMessageAt as string,
      ...(typeof r.messageCount === 'number' && Number.isFinite(r.messageCount) ? { messageCount: r.messageCount } : {}),
    }));
}

export async function fetchConversation(id: string): Promise<CoachConversationDTO> {
  const res = await coachFetch<Partial<CoachConversationDTO> | undefined>(`/me/coach/conversations/${encodeURIComponent(id)}`);
  return { conversationId: res?.conversationId ?? id, messages: res?.messages ?? [] };
}

const CARD_STATUSES: readonly string[] = ['below', 'near', 'above'];
// "−1h 47m", "−12 points": anything much longer would not fit a tile.
const MAX_DELTA_CHARS = 16;

function cardItem(raw: unknown): AnswerCardItemDTO | null {
  if (!isRecord(raw)) return null;
  const { factId, label, display, value, usual, status, deltaDisplay } = raw;
  if (typeof factId !== 'string' || typeof label !== 'string' || typeof display !== 'string') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return {
    factId,
    label,
    display,
    value,
    ...(typeof usual === 'number' && Number.isFinite(usual) ? { usual } : {}),
    ...(typeof status === 'string' && CARD_STATUSES.includes(status) ? { status: status as CardStatusDTO } : {}),
    ...(typeof deltaDisplay === 'string' && deltaDisplay.trim() && deltaDisplay.length <= MAX_DELTA_CHARS ? { deltaDisplay: deltaDisplay.trim() } : {}),
  };
}

function cardItems(raw: unknown): AnswerCardItemDTO[] {
  return Array.isArray(raw) ? raw.map(cardItem).filter((i): i is AnswerCardItemDTO => i !== null) : [];
}

// A card from the stream or from history. The server has already checked it;
// this only guards the layout against a malformed row. No rows, no card.
export function toAnswerCard(raw: unknown): AnswerCardDTO | null {
  if (!isRecord(raw) || typeof raw.headline !== 'string' || !raw.headline.trim()) return null;
  const tiles = cardItems(raw.tiles);
  const ranked = cardItems(raw.ranked);
  if (tiles.length === 0 && ranked.length === 0) return null;
  return {
    headline: raw.headline,
    ...(tiles.length > 0 ? { tiles } : {}),
    ...(ranked.length > 0 ? { ranked } : {}),
    ...(typeof raw.tip === 'string' && raw.tip.trim() ? { tip: raw.tip } : {}),
    source: typeof raw.source === 'string' ? raw.source : '',
  };
}

const TODAY_METRICS: readonly string[] = ['recovery', 'sleep', 'hrv', 'rhr'];
const FACT_UNITS: readonly string[] = ['score', 'ms', 'bpm', 'minutes', 'count', 'percent', 'none'];

function isTodayMetric(value: unknown): value is TodayMetric {
  return typeof value === 'string' && TODAY_METRICS.includes(value);
}

function todayBar(raw: unknown): TodayBarDTO | null {
  if (!isRecord(raw) || !isTodayMetric(raw.metric)) return null;
  const { value, usual } = raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const usualValue = typeof usual === 'number' && Number.isFinite(usual) ? usual : null;
  const given = typeof raw.scaleMax === 'number' && Number.isFinite(raw.scaleMax) && raw.scaleMax > 0 ? raw.scaleMax : null;
  // Spec 1.2: recovery 0-100; the others 0 -> 1.4 x max(value, usual).
  const scaleMax = given ?? (raw.metric === 'recovery' ? 100 : 1.4 * Math.max(value, usualValue ?? value, 1));
  return {
    metric: raw.metric,
    label: typeof raw.label === 'string' ? raw.label : raw.metric,
    value,
    usual: usualValue,
    unit: typeof raw.unit === 'string' && FACT_UNITS.includes(raw.unit) ? (raw.unit as FactUnitDTO) : 'none',
    display: typeof raw.display === 'string' ? raw.display : String(value),
    usualDisplay: typeof raw.usualDisplay === 'string' ? raw.usualDisplay : null,
    status: typeof raw.status === 'string' && CARD_STATUSES.includes(raw.status) ? (raw.status as CardStatusDTO) : null,
    scaleMax,
  };
}

function todaySentence(raw: unknown): TodaySummaryDTO['sentence'] {
  if (!isRecord(raw) || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  const spans = Array.isArray(raw.spans)
    ? raw.spans
        .filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.text === 'string')
        .map((s): TodaySpanDTO => (isTodayMetric(s.metric) ? { text: s.text as string, metric: s.metric } : { text: s.text as string }))
    : [];
  return { text: raw.text, spans: spans.length > 0 ? spans : [{ text: raw.text }], source: raw.source === 'ai' ? 'ai' : 'template' };
}

export function toTodaySummary(raw: unknown): TodaySummaryDTO {
  if (!isRecord(raw)) return { date: '', hasData: false, sentence: null, bars: [] };
  const bars = Array.isArray(raw.bars) ? raw.bars.map(todayBar).filter((b): b is TodayBarDTO => b !== null) : [];
  return {
    date: typeof raw.date === 'string' ? raw.date : '',
    hasData: raw.hasData === true,
    sentence: todaySentence(raw.sentence),
    bars,
  };
}

export async function fetchTodaySummary(): Promise<TodaySummaryDTO> {
  return toTodaySummary(await coachFetch<unknown>('/me/coach/today'));
}
