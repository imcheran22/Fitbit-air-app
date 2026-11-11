// The GET /me/achievements answer (spec 2026-10-06 §6). Levels come from the stored rows (never
// revoked); current and best from the latest evaluation.

import type { Achievement, AchievementFamily } from '@prisma/client';
import { FAMILIES, nextThreshold, type FamilyKind } from './catalogue';
import type { FamilyStanding } from './families';

export interface EarnedLevelDTO { level: number; value: number; earnedOn: string }
export interface FamilyDTO {
  family: AchievementFamily;
  kind: FamilyKind;
  /** The highest stored level, 0..5. */
  level: number;
  thresholds: number[];
  levels: EarnedLevelDTO[];
  current: number;
  best: number;
  nextThreshold: number | null;
}
export interface UncelebratedDTO extends EarnedLevelDTO { id: string; family: AchievementFamily }
export interface AchievementsDTO { since: string; families: FamilyDTO[]; uncelebrated: UncelebratedDTO[] }

const key = (d: Date) => d.toISOString().slice(0, 10);

export function toAchievementsDTO(since: string, standings: readonly FamilyStanding[], rows: readonly Achievement[]): AchievementsDTO {
  const order = new Map(FAMILIES.map((f, i) => [f.family, i] as const));
  const families = FAMILIES.map((def): FamilyDTO => {
    const own = rows.filter((r) => r.family === def.family).sort((a, b) => a.level - b.level);
    const level = own.reduce((m, r) => Math.max(m, r.level), 0);
    const standing = standings.find((s) => s.family === def.family);
    return {
      family: def.family,
      kind: def.kind,
      level,
      thresholds: [...def.thresholds],
      levels: own.map((r) => ({ level: r.level, value: r.value, earnedOn: key(r.earnedOn) })),
      current: standing?.current ?? 0,
      best: standing?.best ?? 0,
      nextThreshold: nextThreshold(def, level),
    };
  });
  const uncelebrated = rows
    .filter((r) => r.celebratedAt === null)
    .sort((a, b) => (order.get(a.family) ?? 0) - (order.get(b.family) ?? 0) || a.level - b.level)
    .map((r) => ({ id: r.id, family: r.family, level: r.level, value: r.value, earnedOn: key(r.earnedOn) }));
  return { since, families, uncelebrated };
}
