import { GLYPHS, LOCKED_PIP, TIERS, coachTier, glyphCells, mixHex, octagonPoints, tierColors, tierTextColor } from '../../src/lib/badgeArt';
import type { AchievementFamily } from '../../src/api/achievements';
import { CHARACTERS } from '../../src/components/characters/registry';

it('has the 12×12 design glyph for every family', () => {
  for (const rows of Object.values(GLYPHS)) {
    expect(rows).toHaveLength(12);
    for (const row of rows) expect(row).toMatch(/^[.#]{12}$/);
  }
  const counts = Object.fromEntries((Object.keys(GLYPHS) as AchievementFamily[]).map((f) => [f, glyphCells(f).length]));
  expect(counts).toEqual({ SLEEP_GOAL: 45, STEADY_BEDTIME: 46, STEP_GOAL: 69, CHECK_IN: 34, BEST_RECOVERY_WEEK: 82, EVERY_DAY_LOGGED: 76, STEADIEST_MONTH: 56 });
  expect(glyphCells('SLEEP_GOAL')[0]).toEqual([5, 0]);
});

it('uses the design tier colours up to Diamond and the coach accent for level V', () => {
  expect(TIERS.map((t) => t.ring)).toEqual(['#3F3F46', '#D08A4E', '#CBD5E1', '#FACC15', '#67E8F9']);
  expect(tierColors(3, '#F9A8D4')).toEqual({ ring: '#FACC15', fill: '#3B300A', glyph: '#FDE68A' });
  expect(tierColors(5, '#F9A8D4')).toEqual({ ring: '#F9A8D4', fill: '#37252F', glyph: '#FCCFE7' });
  expect(coachTier('#4ADE80').ring).toBe('#4ADE80');
  expect(tierColors(9, '#4ADE80').ring).toBe('#4ADE80');
  expect(tierColors(-1, '#4ADE80')).toEqual(TIERS[0]);
  expect(LOCKED_PIP).toBe('#3F3F46');
});

it('mixes hex colours', () => {
  expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  expect(mixHex('#F9A8D4', '#000000', 0.78)).toBe('#37252F');
});

it('gives small tier-coloured text at least 4.5:1 on the light page and card, and the ring itself in dark mode', () => {
  const channel = (hex: string, i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const accents = Object.values(CHARACTERS).map((c) => c.accent);
  for (const accent of accents) {
    for (const level of [1, 2, 3, 4, 5]) {
      const text = tierTextColor(level, accent, false);
      expect(ratio(text, '#F6F6F7')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(tierTextColor(level, accent, true)).toBe(tierColors(level, accent).ring);
    }
  }
});

it('draws the octagon at 30% and 70% of each side, inset for the inner face', () => {
  expect(octagonPoints(0)).toBe('30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30');
  expect(octagonPoints(6)).toBe('32.4,6 67.6,6 94,32.4 94,67.6 67.6,94 32.4,94 6,67.6 6,32.4');
});
