// The KIP v1 colours (owner, 2026-10-10), by name; the app holds the hex values (mobile src/lib/kip/kipArt.ts).

export const KIP_COLOUR_NAMES = ['coral', 'cobalt', 'ink', 'lemon', 'lilac', 'lime', 'mint', 'sky', 'slate', 'snow'] as const;
export type KipColourName = (typeof KIP_COLOUR_NAMES)[number];
export const DEFAULT_KIP_COLOUR: KipColourName = 'coral';

export function isKipColour(value: unknown): value is KipColourName {
  return typeof value === 'string' && (KIP_COLOUR_NAMES as readonly string[]).includes(value);
}

/** A stored or sent name, or coral for anything outside the list. */
export function kipColourOf(value: string | null | undefined): KipColourName {
  return isKipColour(value) ? value : DEFAULT_KIP_COLOUR;
}
