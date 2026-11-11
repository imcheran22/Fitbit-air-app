import { useEffect } from 'react';
import type { FamilyKind } from '../api/achievements';
import { refreshAchievements, useAchievements } from './achievementsStore';
import { levelsEarnedBetween, type BadgeRef } from './badges';

/**
 * Badge levels earned between two dates (inclusive), read at view time (spec 2026-10-06 §6: a level
 * dated into a period after its recap was opened shows the next time it is viewed), so it re-reads
 * the badges on mount (coalesced with any load in flight). [] until loaded, on a 404 and on an error.
 */
export function useEarnedBadges(from: string, to: string, kind?: FamilyKind): BadgeRef[] {
  const { state } = useAchievements();
  useEffect(() => {
    void refreshAchievements();
  }, []);
  return state.status === 'ready' ? levelsEarnedBetween(state.data, from, to, kind) : [];
}
