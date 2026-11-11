// Coach observability (spec "Cross-cutting: observability"). Correctness
// monitoring, not performance: a spike in coach.answer_sentence_dropped split
// by reason is the signal that a prompt or persona change started producing
// numbers that are not on the fact sheet.
//
// DEVIATION: the spec describes OpenTelemetry spans. OpenTelemetry is not a
// dependency of this repo, so events go through this small pluggable
// interface and the default sink is a structured logger. An OTel sink can
// implement CoachTelemetry later without touching the answer pipeline.
//
// Events carry ids, counts and reasons ONLY. The attribute type is restricted
// to primitives and no call site is given message text or tool results, so a
// sink cannot leak them; the default sink additionally never logs a key named
// like text.

export type CoachEventName =
  | 'coach.latency_budget_exceeded'
  | 'coach.safety_classifier'
  | 'coach.memory_proposed'
  | 'coach.memory_rejected'
  | 'coach.memory_resolved'
  | 'coach.digest_generated'
  | 'coach.digest_skipped'
  | 'coach.digest_failed'
  | 'coach.push_sent'
  | 'coach.push_failed'
  | 'coach.retention_run'
  | 'coach.user_data_deleted'
  | 'coach.answer_sentence_dropped'
  | 'coach.answer_regenerated'
  | 'coach.answer_done'
  | 'coach.answer_error'
  | 'coach.model_warm'
  | 'coach.hosted_fallback'
  | 'coach.summary_failed'
  | 'recap.built'
  | 'recap.skipped'
  | 'recap.rebuilt'
  | 'recap.push_sent'
  | 'recap.push_failed';

export type CoachEventAttributes = Record<string, string | number | boolean>;

export interface CoachEvent {
  name: CoachEventName;
  userId: string;
  personaId: string;
  attributes: CoachEventAttributes;
}

export interface CoachTelemetry {
  emit(event: CoachEvent): void;
}

const FORBIDDEN_KEYS = /^(text|message|content|body|prompt|reply|result|args|value|memory|digest|title|categories|category)$/i;

export class LoggerCoachTelemetry implements CoachTelemetry {
  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  emit(event: CoachEvent): void {
    const attributes: CoachEventAttributes = {};
    for (const [k, v] of Object.entries(event.attributes)) {
      if (!FORBIDDEN_KEYS.test(k)) attributes[k] = v;
    }
    this.log(JSON.stringify({ event: event.name, userId: event.userId, personaId: event.personaId, ...attributes }));
  }
}

export class NoopCoachTelemetry implements CoachTelemetry {
  emit(): void {}
}
