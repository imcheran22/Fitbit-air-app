import {
  weatherFor, VERDICT, formatDayShort, weekdayShort, formatMinutes, formatGoal, headerSubtitle, heroLine, buildRecoverySummary,
  buildingCopy, noDataLine, debtBlockCount, debtBlocks, debtClearCopy, monthCaption, monthTitle, initialChip, debtFactor,
  RECOVERY_COPY,
} from '../../src/lib/recoveryCopy';
import { recoveryQuestion } from '../../src/lib/coachPrompts';
import type { DailyScoreDTO, FactorDTO } from '../../src/api/scores';

const BANDS = { excellent: 75, good: 55, fair: 40 };
const f = (factor: FactorDTO['factor'], points: number, extra: Partial<FactorDTO> = {}): FactorDTO => ({ factor, label: factor, z: 0, weight: 0.3, contribution: 0, points, imputed: false, excluded: false, ...extra });
const score = (factors: FactorDTO[], confidenceLevel: DailyScoreDTO['confidenceLevel'] = 'HIGH'): DailyScoreDTO => ({ date: '2026-10-08', type: 'RECOVERY', score: 68, confidenceLevel, algorithmVersion: 'v3', factors, coldStart: [] });

describe('weather', () => {
  it('maps bands and states', () => {
    expect([80, 60, 45, 20].map((s) => weatherFor(s, 'READY', BANDS))).toEqual(['clear', 'mostlyClear', 'cloudy', 'stormy']);
    expect(weatherFor(null, 'BUILDING', BANDS)).toBe('building');
    expect(weatherFor(null, 'NO_DATA', BANDS)).toBe('none');
    expect(VERDICT.cloudy).toBe('Cloudy');
    expect(VERDICT.mostlyClear).toBe('Mostly clear');
  });
});

describe('formatting', () => {
  it('formats days, minutes and goals', () => {
    expect(formatDayShort('2026-10-08')).toBe('Thu 8 Oct');
    expect(formatMinutes(190)).toBe('3h 10m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(480)).toBe('8h');
    expect(formatMinutes(0)).toBe('0m');
    expect(formatGoal(480)).toBe('8h');
    expect(formatGoal(450)).toBe('7h 30m');
  });
  it('formatGoal rounds before splitting, never "7h 60m"', () => {
    expect(formatGoal(479.6)).toBe('8h');
  });
  it('reads civil dates by components, never as UTC instants (1 Oct 2026 is a Thursday)', () => {
    // new Date('2026-10-08') is UTC midnight: west of UTC it is still the 7th (Wed). Never parse that way.
    expect(weekdayShort('2026-10-08')).toBe('Thu');
    expect(weekdayShort('2026-10-01')).toBe('Thu');
    expect(weekdayShort('2026-10-05')).toBe('Mon');
  });
  it('header subtitle: updated time today, date alone on a past day or without a row', () => {
    expect(headerSubtitle('2026-10-08', '2026-10-08T07:12:00', true)).toMatch(/^Thu 8 Oct · updated 7:12\s?AM$/);
    expect(headerSubtitle('2026-10-02', '2026-10-02T07:12:00', false)).toBe('Fri 2 Oct');
    expect(headerSubtitle('2026-10-08', null, true)).toBe('Thu 8 Oct');
  });
});

describe('heroLine', () => {
  const base = { score: 68, bands: BANDS, date: '2026-10-08', confidence: 'HIGH' as const };
  it('vs yesterday, vs a weekday within 7 days, dropped when older', () => {
    expect(heroLine({ ...base, previous: { date: '2026-10-07', score: 62 } })).toEqual({
      band: 'Good', rest: ' · +6 vs yesterday · High confidence', delta: ' · +6 vs yesterday', lead: ' · +6 vs yesterday · ',
      confidence: 'High confidence', spoken: 'Up 6 from yesterday. High confidence.',
    });
    expect(heroLine({ ...base, previous: { date: '2026-10-05', score: 70 } }).rest).toBe(' · −2 vs Mon · High confidence');
    expect(heroLine({ ...base, previous: { date: '2026-09-20', score: 70 } }).rest).toBe(' · High confidence');
    expect(heroLine({ ...base, previous: null }).rest).toBe(' · High confidence');
  });
  it('zero delta reads same as yesterday; rounds before subtracting', () => {
    expect(heroLine({ ...base, score: 68.4, previous: { date: '2026-10-07', score: 67.6 } }).rest).toBe(' · same as yesterday · High confidence');
  });
  it('returns delta and confidence separately; rest is delta + " · " + confidence', () => {
    const low = heroLine({ ...base, confidence: 'LOW', previous: { date: '2026-10-05', score: 70 } });
    expect(low.delta).toBe(' · −2 vs Mon');
    expect(low.confidence).toBe('Low confidence');
    expect(low.rest).toBe(`${low.delta} · ${low.confidence}`);
    const none = heroLine({ ...base, confidence: 'MEDIUM', previous: null });
    expect(none.delta).toBe('');
    expect(none.confidence).toBe('Medium confidence');
    expect(none.rest).toBe(' · Medium confidence');
  });
  it('Low band word, never Poor', () => {
    expect(heroLine({ ...base, score: 20, previous: null }).band).toBe('Low');
  });
  it('lead is the visible text between the band word and the confidence word', () => {
    const hl = heroLine({ ...base, previous: { date: '2026-10-05', score: 70 } });
    expect(hl.lead).toBe(' · −2 vs Mon · ');
    expect(`${hl.lead}${hl.confidence}`).toBe(hl.rest);
    expect(heroLine({ ...base, previous: null }).lead).toBe(' · ');
  });
  it('spoken: the delta in words, sentences, no middle dots or minus signs (spec §7)', () => {
    const spoken = (previous: { date: string; score: number } | null, extra: Partial<Omit<typeof base, 'confidence'>> & { confidence?: 'HIGH' | 'MEDIUM' | 'LOW' } = {}) =>
      heroLine({ ...base, ...extra, previous }).spoken;
    expect(spoken({ date: '2026-10-07', score: 62 })).toBe('Up 6 from yesterday. High confidence.');
    expect(spoken({ date: '2026-10-07', score: 70 })).toBe('Down 2 from yesterday. High confidence.');
    expect(spoken({ date: '2026-10-07', score: 67.6 }, { score: 68.4 })).toBe('Same as yesterday. High confidence.');
    expect(spoken({ date: '2026-10-05', score: 70 })).toBe('Down 2 from Monday. High confidence.');
    expect(spoken({ date: '2026-10-05', score: 60 }, { confidence: 'LOW' })).toBe('Up 8 from Monday. Low confidence.');
    expect(spoken({ date: '2026-10-05', score: 68 })).toBe('Same as Monday. High confidence.');
    expect(spoken({ date: '2026-09-20', score: 70 })).toBe('High confidence.');
    expect(spoken(null, { confidence: 'MEDIUM' })).toBe('Medium confidence.');
  });
  it('heroA11y reads as the spec §7 example', () => {
    const hl = heroLine({ ...base, previous: { date: '2026-10-07', score: 62 } });
    const label = RECOVERY_COPY.heroA11y(68, hl.band, 'Mostly clear', hl.spoken);
    expect(label).toBe('Recovery 68, Good, mostly clear. Up 6 from yesterday. High confidence.');
    expect(label).not.toMatch(/[·−]/);
  });
});

describe('buildRecoverySummary', () => {
  it('top lift and top drag, present tense', () => {
    expect(buildRecoverySummary(score([f('HRV', 8), f('RHR', 1), f('SLEEP_DEBT', -5)]), false)).toBe(
      'A warm front in your HRV is lifting you today. Sleep-debt fog lingers; an early night clears it.',
    );
  });
  it('light fog under 3 points; past tense', () => {
    expect(buildRecoverySummary(score([f('RHR', 2), f('SLEEP_DEBT', -2)]), true)).toBe(
      'A calm resting heart rate lifted you that day. Light sleep-debt fog lingered; an early night would have cleared it.',
    );
  });
  it('calm when nothing reaches half a point; low confidence appended; excluded ignored', () => {
    expect(buildRecoverySummary(score([f('HRV', 0.4), f('SLEEP_DEBT', -9, { excluded: true })], 'LOW'), false)).toBe(
      'Calm conditions: everything is close to your usual. Some readings are missing, so treat today as a rough read.',
    );
  });
});

describe('building and no data', () => {
  it('building copy', () => {
    expect(buildingCopy({ metric: 'HRV', daysCollected: 9, daysRequired: 14 })).toEqual({
      numeral: 'Day 9 of 14',
      line: 'Your forecast is charging up · 5 days to go',
      summary: 'We need 5 more days of HRV to read your weather. Keep wearing your watch to bed.',
    });
  });
  it('no data line', () => {
    expect(noDataLine(true)).toBe("Waiting for last night's data");
    expect(noDataLine(false)).toBe('No data synced for this day');
  });
});

describe('sleep debt', () => {
  it('debtFactor: the word, tone and signed number agree, rounding half away from zero', () => {
    expect(debtFactor(-0.5)).toEqual({ tone: 'drag', text: 'Fog · −1' });
    expect(debtFactor(-0.49)).toEqual({ tone: 'calm', text: 'Calm · 0' });
    expect(debtFactor(0.49)).toEqual({ tone: 'calm', text: 'Calm · 0' });
    expect(debtFactor(0.5)).toEqual({ tone: 'lift', text: 'Clear · +1' });
    expect(debtFactor(-5)).toEqual({ tone: 'drag', text: 'Fog · −5' });
    expect(debtFactor(2.4)).toEqual({ tone: 'lift', text: 'Clear · +2' });
    expect(debtFactor(0)).toEqual({ tone: 'calm', text: 'Calm · 0' });
  });

  it('block count is clamped to 8..16', () => {
    expect(debtBlockCount(190, 125)).toBe(8);
    expect(debtBlockCount(0, null)).toBe(8);
    expect(debtBlockCount(2000, 125)).toBe(16);
  });
  it('blocks: whole 30-min blocks, a partial for a remainder of 10+ min, then empty', () => {
    expect(debtBlocks(75, 60)).toEqual(['full', 'full', 'partial', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(debtBlocks(65, 60).slice(0, 3)).toEqual(['full', 'full', 'empty']);
  });
  it('clear copy', () => {
    expect(debtClearCopy(0, 480)).toBe("You're within your usual.");
    expect(debtClearCopy(1, 480)).toBe('One night at your 8h goal clears the fog.');
    expect(debtClearCopy(2, 450)).toBe('Two nights at your 7h 30m goal clear the fog.');
    expect(debtClearCopy(12, 480)).toBe('12 nights at your 8h goal clear the fog.');
    expect(debtClearCopy(null, 480)).toBe('');
  });
});

describe('calendar copy', () => {
  it('month caption lists only nonzero Excellent and Low', () => {
    expect(monthCaption({ excellent: 1, good: 5, fair: 2, low: 1 })).toBe('month average · 1 Excellent, 1 Low');
    expect(monthCaption({ excellent: 0, good: 5, fair: 2, low: 0 })).toBe('month average');
  });
  it('month title adds the year outside the current year', () => {
    expect(monthTitle('2026-10', '2026-10-08')).toBe('October');
    expect(monthTitle('2025-12', '2026-10-08')).toBe('December 2025');
  });
});

describe('chips and coach', () => {
  it('initial chip is the goal rounded to 6..9, default 8', () => {
    expect(initialChip(450)).toBe(8);
    expect(initialChip(390)).toBe(7);
    expect(initialChip(300)).toBe(6);
    expect(initialChip(660)).toBe(9);
    expect(initialChip(undefined)).toBe(8);
  });
  it('recovery questions carry no numbers', () => {
    expect(recoveryQuestion({ state: 'READY', isToday: true, date: '2026-10-08' })).toBe('Why is my recovery where it is today?');
    expect(recoveryQuestion({ state: 'READY', isToday: false, date: '2026-10-02' })).toBe('Why was my recovery what it was on Fri 2 Oct?');
    expect(recoveryQuestion({ state: 'BUILDING', isToday: true, date: '2026-10-08' })).toBe('When will my recovery score be ready?');
    expect(recoveryQuestion({ state: 'NO_DATA', isToday: true, date: '2026-10-08' })).toBe("Why don't I have a recovery score today?");
    expect(recoveryQuestion({ state: 'NO_DATA', isToday: false, date: '2026-10-02' })).toBe("Why don't I have a recovery score for Fri 2 Oct?");
  });
});
