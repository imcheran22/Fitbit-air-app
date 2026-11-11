import type { AchievementFamily, UncelebratedLevel } from '../api/achievements';
import { FAMILY_ORDER } from './badges';

// The unlock celebrations (spec 2026-10-06 §6): one per family, at its highest new level, highest
// levels first (catalogue order on a tie). Closing one marks all of that family's new levels
// celebrated, lower ones included.

export interface Celebration {
  family: AchievementFamily;
  level: number;
  value: number;
  earnedOn: string;
  /** Every new level of the family: all are marked celebrated together. */
  ids: string[];
}

export function celebrationQueue(pending: readonly UncelebratedLevel[]): Celebration[] {
  const byFamily = new Map<AchievementFamily, UncelebratedLevel[]>();
  for (const level of pending) byFamily.set(level.family, [...(byFamily.get(level.family) ?? []), level]);
  return [...byFamily.entries()]
    .map(([family, rows]): Celebration => {
      const top = rows.reduce((a, b) => (b.level > a.level ? b : a));
      return { family, level: top.level, value: top.value, earnedOn: top.earnedOn, ids: rows.map((r) => r.id) };
    })
    .sort((a, b) => b.level - a.level || FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
}
