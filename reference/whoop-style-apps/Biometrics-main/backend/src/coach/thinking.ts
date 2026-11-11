// The two thinking settings (spec 2026-10-01 §4, §5, §8). Stored as nullable
// strings on User; null, or an id a later version dropped, means the default.

export const THINKING_ATTACHMENTS = ['bulb', 'cloud', 'typing', 'hourglass', 'gears', 'question', 'sparkles', 'clock', 'spinner'] as const;
export const THINKING_TEXTS = ['lines', 'placeholder', 'tag', 'typewriter', 'nameplate', 'steps', 'shimmer', 'bouncy', 'dialog', 'strip'] as const;
export const DEFAULT_THINKING_ATTACHMENT = 'bulb';
export const DEFAULT_THINKING_TEXT = 'steps';

const has = (list: readonly string[], v: unknown): v is string => typeof v === 'string' && list.includes(v);

export const isThinkingAttachment = (v: unknown): v is string => has(THINKING_ATTACHMENTS, v);
export const isThinkingText = (v: unknown): v is string => has(THINKING_TEXTS, v);
export const resolveThinkingAttachment = (v: string | null | undefined) => (isThinkingAttachment(v) ? v : DEFAULT_THINKING_ATTACHMENT);
export const resolveThinkingText = (v: string | null | undefined) => (isThinkingText(v) ? v : DEFAULT_THINKING_TEXT);
