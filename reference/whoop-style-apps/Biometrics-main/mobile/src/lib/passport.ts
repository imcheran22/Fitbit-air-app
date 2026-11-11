// The Profile passport's pure parts (spec 2026-10-13 §2): the member code, the joined date, the two decorative
// lines along the bottom, and which badges are stamped.

import type { AchievementFamily, FamilyAchievements } from '../api/achievements';
import { FAMILY_ORDER } from './badges';
import { MONTH_SHORT } from './heatmap';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MRZ_WIDTH = 32;

/** "KIP-7Q4M": four characters hashed from the user id (FNV-1a), stable and not a piece of the id. */
export function memberCode(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length);
  }
  return `KIP-${code}`;
}

/** "14 MAR 2026". */
export function formatJoined(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]!.toUpperCase()} ${date.slice(0, 4)}`;
}

const mrzText = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '<');
const mrzLine = (s: string) => s.padEnd(MRZ_WIDTH, '<').slice(0, MRZ_WIDTH);

/** The passport's two machine-readable-zone lines: decoration, drawn only on the device. */
export function mrzLines(p: { name: string; code: string; joinedOn: string | null; home: string }): [string, string] {
  const date = p.joinedOn ? `${p.joinedOn.slice(2, 4)}${p.joinedOn.slice(5, 7)}${p.joinedOn.slice(8, 10)}` : '<<<<<<';
  return [mrzLine(`P<KIP<<${mrzText(p.name)}`), mrzLine(`${p.code.replace('-', '')}<<${date}<<${mrzText(p.home)}`)];
}

const STAMP_SHORT: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'SLEEP',
  STEADY_BEDTIME: 'BEDTIME',
  STEP_GOAL: 'STEPS',
  CHECK_IN: 'CHECK-IN',
  BEST_RECOVERY_WEEK: 'RECOVERY',
  EVERY_DAY_LOGGED: 'EVERY DAY',
  STEADIEST_MONTH: 'STEADIEST',
};
const MAX_STAMPS = 5;

export interface Stamp {
  family: AchievementFamily;
  level: number;
  short: string;
}

/** Up to five earned families at their top level, highest first (ties in badge order). */
export function passportStamps(families: FamilyAchievements[]): Stamp[] {
  return families
    .filter((f) => f.level > 0 && FAMILY_ORDER.includes(f.family))
    .sort((a, b) => b.level - a.level || FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family))
    .slice(0, MAX_STAMPS)
    .map((f) => ({ family: f.family, level: f.level, short: STAMP_SHORT[f.family] }));
}
