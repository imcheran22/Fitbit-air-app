// KIP colours by name (spec 2026-10-13 KIP colour §1): the server sends names, never hex.
import { DEFAULT_KIP_COLOUR, KIP_COLOURS, type KipColour } from './kipArt';

export const KIP_COLOUR_ORDER = Object.keys(KIP_COLOURS) as KipColour[];

/** A name from the server, or coral for a missing or unknown one (an older server, a newer colour). */
export function kipColourOf(value: unknown): KipColour {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KIP_COLOURS, value) ? (value as KipColour) : DEFAULT_KIP_COLOUR;
}

/** "Coral", "Sky": the name people read. */
export function kipColourName(colour: KipColour): string {
  return colour.charAt(0).toUpperCase() + colour.slice(1);
}
