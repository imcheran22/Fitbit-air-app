// Persona fields, memory values and dates go into prompts as quoted data, never
// raw: control characters and newlines collapse to spaces, template/markup
// metacharacters ({ } ` < > [ ]) are dropped so no fence, tag, fact id or reference can
// form, the length is capped, and JSON quoting escapes any remaining quote or
// backslash. The persona config is therefore a config surface, not a
// prompt-injection surface.

const MAX_FIELD_CHARS = 300;

export function escapeField(value: unknown, max = MAX_FIELD_CHARS): string {
  return JSON.stringify(cleanField(value, max));
}

/**
 * The same cleaning without the quotes, for user-written text that is also
 * shown back to the user (a custom habit's label in a card or a digest): one
 * line, no fence, tag or reference, capped.
 */
export function cleanField(value: unknown, max = MAX_FIELD_CHARS): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/[{}`<>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
