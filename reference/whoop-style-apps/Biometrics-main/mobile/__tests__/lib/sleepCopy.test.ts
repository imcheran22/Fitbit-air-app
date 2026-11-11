import {
  askLabel, buildingHero, durationCaption, formatHm, goalPart, goalRowA11y, goalRowLine, heroA11y, infoBands, infoWeights,
  monthCellLabel, napOnlySummaryA11y, nightEyebrow, noNightHero, noNightSummaryA11y, noScoreHero, pickerCellLabel, pickerWeekday,
  regularityA11y, regularityPendingA11y, regularityWord,
  SLEEP_COPY, sleepHeroLine, sleepVerdict, spreadLine, summaryA11y, summaryLine, usualPart,
} from '../../src/lib/sleepCopy';
import { sleepQuestion } from '../../src/lib/coachPrompts';
import type { FactorDTO } from '../../src/api/scores';
import type { WindDownSettings } from '../../src/lib/windDown';
import { BANDS, GOAL, REMINDER, TODAY } from '../../jest-mocks/sleepPageFixture';

const SPOKEN_FORBIDDEN = /[·−]/;

describe('verdict (decision 6)', () => {
  const v = (score: number, mainMinutes: number | null = 450, goalMinutes: number | null = 480) => sleepVerdict({ score, bands: BANDS, mainMinutes, goalMinutes });
  it('names each live band', () => {
    expect([80, 60, 45, 20].map((s) => v(s))).toEqual(['Restful night', 'Solid night', 'Restless night', 'Rough night']);
    expect(v(74.9)).toBe('Solid night');
    expect(v(75)).toBe('Restful night');
  });
  it('Short night overrides any band at 60 min or more under the goal, by quantity only', () => {
    expect(v(80, 420)).toBe('Short night');
    expect(v(80, 421)).toBe('Restful night');
    expect(v(66, 410)).toBe('Short night');
    expect(v(20, 300)).toBe('Short night');
  });
  it('without a night or a goal there is no override', () => {
    expect(v(80, null)).toBe('Restful night');
    expect(v(80, 300, null)).toBe('Restful night');
  });
});

describe('hero line', () => {
  const base = { score: 78, bands: BANDS, date: TODAY, today: TODAY, confidence: 'HIGH' as const };
  it('vs yesterday only when D is today', () => {
    const l = sleepHeroLine({ ...base, previous: { date: '2026-10-07', score: 72 } });
    expect(l.text).toBe('Excellent · +6 vs yesterday · High confidence');
    expect(l.band).toBe('Excellent');
    expect(l.spoken).toBe('Up 6 from yesterday. High confidence.');
  });
  it('a past night reads the weekday, with a real minus sign', () => {
    // Mon 5 Oct 2026 (1 Oct is a Thursday).
    const l = sleepHeroLine({ ...base, score: 64, date: '2026-10-06', previous: { date: '2026-10-05', score: 70 } });
    expect(l.text).toBe('Good · −6 vs Mon · High confidence');
    expect(l.spoken).toBe('Down 6 from Monday. High confidence.');
  });
  it('within 7 days names the weekday; older or missing drops the delta', () => {
    expect(sleepHeroLine({ ...base, previous: { date: '2026-10-03', score: 70 } }).text).toBe('Excellent · +8 vs Sat · High confidence');
    expect(sleepHeroLine({ ...base, previous: { date: '2026-09-20', score: 70 } }).text).toBe('Excellent · High confidence');
    expect(sleepHeroLine({ ...base, previous: null }).text).toBe('Excellent · High confidence');
  });
  it('rounds before subtracting; zero reads same as', () => {
    const l = sleepHeroLine({ ...base, score: 72.4, confidence: 'MEDIUM', previous: { date: '2026-10-07', score: 71.6 } });
    expect(l.text).toBe('Good · same as yesterday · Medium confidence');
    expect(l.spoken).toBe('Same as yesterday. Medium confidence.');
  });
  it('the Low band word, never Poor', () => {
    expect(sleepHeroLine({ ...base, score: 20, previous: null }).band).toBe('Low');
  });
  it('the spoken hero is one sentence without · or −', () => {
    const label = heroA11y(78, 'Excellent', 'Restful night', 'Up 6 from yesterday. High confidence.');
    expect(label).toBe('Sleep score 78, Excellent, restful night. Up 6 from yesterday. High confidence.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
    expect(sleepHeroLine({ ...base, score: 64, date: '2026-10-06', previous: { date: '2026-10-05', score: 70 } }).spoken).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('hero states', () => {
  it('building counts nights', () => {
    expect(buildingHero({ metric: 'SLEEP_EFFICIENCY', daysCollected: 9, daysRequired: 14 })).toEqual({
      numeral: 'Night 9 of 14', verdict: 'Learning your sleep', line: '5 nights to go', spoken: 'Learning your sleep. Night 9 of 14. 5 nights to go.',
    });
    expect(buildingHero({ metric: 'SLEEP_EFFICIENCY', daysCollected: 13, daysRequired: 14 }).line).toBe('1 night to go');
    expect(buildingHero(null)).toEqual({ numeral: '—', verdict: 'Learning your sleep', line: null, spoken: 'Learning your sleep' });
  });
  it('the no-night, nap-only and too-few-nights labels read without "·" or unit letters (final review I-4)', () => {
    const labels = [noNightSummaryA11y(TODAY), napOnlySummaryA11y(TODAY, 20, '14:10'), regularityPendingA11y(2)];
    expect(labels).toEqual([
      'Night ending Thursday 8 October. No sleep recorded for this night.',
      'Night ending Thursday 8 October. Only a nap, 20 minutes at 2:10 pm.',
      'Regularity, 7 nights. Not enough nights yet. 2 more to go.',
    ]);
    for (const l of labels) expect(l).not.toMatch(SPOKEN_FORBIDDEN);
  });
  it('no score yet: on its way for today and yesterday, else none', () => {
    expect(noScoreHero(TODAY, TODAY)).toEqual({ verdict: 'Score on its way', line: 'It appears a few minutes after your watch syncs' });
    expect(noScoreHero('2026-10-07', TODAY).verdict).toBe('Score on its way');
    expect(noScoreHero('2026-10-05', TODAY)).toEqual({ verdict: 'No score for this night', line: null });
  });
  it('no night: waiting today, nothing synced before, only a nap', () => {
    expect(noNightHero({ isToday: true, napOnly: false })).toEqual({ verdict: 'No sleep recorded', line: "Waiting for last night's data" });
    expect(noNightHero({ isToday: false, napOnly: false }).line).toBe('Nothing synced for this night');
    expect(noNightHero({ isToday: true, napOnly: true }).line).toBe('Only a nap was recorded');
  });
});

describe('night summary', () => {
  it('eyebrow: last night today, the short date otherwise (real weekdays)', () => {
    expect(nightEyebrow(TODAY, TODAY)).toBe('Last night · Thu 8 Oct');
    expect(nightEyebrow('2026-10-05', TODAY)).toBe('Mon 5 Oct');
  });
  it('duration caption with 0, 1 and several naps (zero-length naps dropped)', () => {
    expect(durationCaption(432, [])).toBe('asleep');
    expect(durationCaption(432, [20])).toBe('main sleep · 7h 32m with a nap');
    expect(durationCaption(432, [20, 15, 0])).toBe('main sleep · 7h 47m with naps');
  });
  it('usual part', () => {
    expect(usualPart(432, 420)).toBe('+12m vs your usual');
    expect(usualPart(412, 420)).toBe('−8m vs your usual');
    expect(usualPart(420.4, 420)).toBe('same as your usual');
    expect(usualPart(510, 420)).toBe('+1h 30m vs your usual');
    expect(usualPart(432, null)).toBeNull();
  });
  it('goal part, with the 5-minute edge', () => {
    expect(goalPart(432, 480)).toBe('48m short of your 8h goal');
    expect(goalPart(502, 480)).toBe('22m over your 8h goal');
    expect(goalPart(476, 480)).toBe('right on your 8h goal');
    expect(goalPart(475, 480)).toBe('5m short of your 8h goal');
    expect(goalPart(400, 450)).toBe('50m short of your 7h 30m goal');
  });
  it('summary line drops what is missing', () => {
    const p = { bedtime: '23:08', wakeTime: '06:40', mainMinutes: 432 };
    expect(summaryLine({ ...p, usual: 420, goal: 480 })).toBe('11:08 pm → 6:40 am · +12m vs your usual · 48m short of your 8h goal');
    expect(summaryLine({ ...p, usual: null, goal: 480 })).toBe('11:08 pm → 6:40 am · 48m short of your 8h goal');
    expect(summaryLine({ ...p, usual: null, goal: null })).toBe('11:08 pm → 6:40 am');
  });
  it('spoken summary (spec §7)', () => {
    const label = summaryA11y({ date: TODAY, mainMinutes: 432, bedtime: '23:08', wakeTime: '06:40', usual: 420, goal: 480 });
    expect(label).toBe('Night ending Thursday 8 October. 7 hours 12 minutes asleep. 11:08 pm to 6:40 am. 12 minutes more than usual. 48 minutes short of your 8 hour goal.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
    expect(summaryA11y({ date: TODAY, mainMinutes: 478, bedtime: '23:08', wakeTime: '06:40', usual: 478, goal: 480 })).toContain('Same as usual. Right on your 8 hour goal.');
  });
});

describe('numbers and words', () => {
  it('formatHm', () => {
    expect(formatHm(432)).toBe('7:12');
    expect(formatHm(302)).toBe('5:02');
    expect(formatHm(0)).toBe('0:00');
    expect(formatHm(59.6)).toBe('1:00');
  });
  it('regularity words at 50 and 75, spreads and the spoken card', () => {
    expect([75, 74, 50, 49].map(regularityWord)).toEqual(['Very regular', 'Fairly regular', 'Fairly regular', 'Irregular']);
    expect(spreadLine(24.4, 18)).toBe('Bedtime ±24m · Wake ±18m');
    expect(spreadLine(24, null)).toBe('Bedtime ±24m');
    expect(spreadLine(null, null)).toBeNull();
    const label = regularityA11y(74, 'Fairly regular', 24, 18);
    expect(label).toBe('Regularity 74, fairly regular. Bedtime varies by 24 minutes. Wake time varies by 18 minutes.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('goal row', () => {
  const off: WindDownSettings = { ...REMINDER, enabled: false };
  it('bed, wake, goal and the reminder', () => {
    expect(goalRowLine(GOAL, REMINDER)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h · Reminder 30 min before');
    expect(goalRowLine(GOAL, off)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h · Reminder off');
    expect(goalRowLine(GOAL, null)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h');
  });
  it('the reminder needs a bedtime; unset reads the prompt', () => {
    expect(goalRowLine({ ...GOAL, bedtimeGoal: null }, REMINDER)).toBe('Wake 6:45 am · 8h');
    expect(goalRowLine({ sleepGoalMinutes: 450, bedtimeGoal: null, wakeGoal: null }, REMINDER)).toBe('Set a bedtime goal · 7h 30m');
  });
  it('spoken row', () => {
    const label = goalRowA11y(goalRowLine(GOAL, REMINDER));
    expect(label).toBe('Bedtime goal. Bed 10:45 pm, Wake 6:45 am, 8 hours, Reminder 30 min before.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('picker and month labels', () => {
  it('weekday, Last for today', () => {
    expect(pickerWeekday(TODAY, TODAY)).toBe('Last');
    expect(pickerWeekday('2026-10-02', TODAY)).toBe('Fri');
  });
  it('spoken cells (spec §7)', () => {
    expect(pickerCellLabel({ date: TODAY, today: TODAY, minutes: 432, band: 'Excellent' })).toBe('Thursday, last night, 7 hours 12 minutes, Excellent');
    expect(pickerCellLabel({ date: '2026-10-05', today: TODAY, minutes: null, band: null })).toBe('Monday, no sleep recorded');
    expect(pickerCellLabel({ date: '2026-10-04', today: TODAY, minutes: 514, band: null })).toBe('Sunday, 8 hours 34 minutes');
    expect(monthCellLabel('2026-10-02', 401)).toBe('Friday 2 October, 6 hours 41 minutes');
    expect(monthCellLabel('2026-10-06', null)).toBe('Tuesday 6 October, no sleep recorded');
    for (const l of [pickerCellLabel({ date: TODAY, today: TODAY, minutes: 432, band: 'Low' }), monthCellLabel('2026-10-02', 401)]) expect(l).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('info sheet', () => {
  const f = (factor: FactorDTO['factor'], label: string, weight: number, excluded = false): FactorDTO => ({ factor, label, z: 0, weight, contribution: 0, points: 0, imputed: false, excluded });
  it('the weights this night used, excluded factors omitted', () => {
    expect(infoWeights([f('SLEEP_DURATION', 'Sleep duration', 0.5), f('SLEEP_EFFICIENCY', 'Sleep efficiency', 0.3), f('CIRCADIAN_CONSISTENCY', 'Bedtime consistency', 0.2)]))
      .toBe('This night weighted sleep duration 50, sleep efficiency 30, bedtime consistency 20.');
    expect(infoWeights([f('SLEEP_DURATION', 'Sleep duration', 0.625), f('SLEEP_EFFICIENCY', 'Sleep efficiency', 0.375), f('CIRCADIAN_CONSISTENCY', 'Bedtime consistency', 0, true)]))
      .toBe('This night weighted sleep duration 63, sleep efficiency 38.');
    expect(infoWeights([])).toBeNull();
  });
  it('band ranges with their verdicts, and the Short night rule', () => {
    expect(infoBands(BANDS)).toEqual([
      'Restful night · Excellent · 75 and up',
      'Solid night · Good · 55–74',
      'Restless night · Fair · 40–54',
      'Rough night · Low · under 40',
      'Short night · 1h or more under your goal, on any band',
    ]);
    expect(infoBands(undefined)[0]).toBe('Restful night · Excellent · 75 and up');
    expect(infoBands(null)[0]).toBe('Restful night · Excellent · 75 and up');
  });
});

describe('ask and fixed strings', () => {
  it('ask labels', () => {
    expect(askLabel('Axo', true)).toBe('Ask Axo about last night');
    expect(askLabel('Axo', false)).toBe('Ask Axo about this night');
  });
  it('sleep questions name the night and carry no numbers from the page', () => {
    expect(sleepQuestion(TODAY, true, true)).toBe('How was my sleep last night?');
    expect(sleepQuestion('2026-10-05', false, true)).toBe('How was my sleep on Monday 5 October?');
    expect(sleepQuestion(TODAY, true, false)).toBe("Why don't I have sleep data for last night?");
    expect(sleepQuestion('2026-10-05', false, false)).toBe("Why don't I have sleep data for Monday 5 October?");
  });
  it('rows and captions', () => {
    expect(SLEEP_COPY.napRow(20, '14:10')).toBe('20m at 2:10 pm');
    expect(SLEEP_COPY.onlyNap(20, '14:10')).toBe('Only a nap: 20m at 2:10 pm');
    expect(SLEEP_COPY.nightsAtGoal(2, 8)).toBe('2 of 8');
    expect(SLEEP_COPY.stillSyncing(false)).toBe("Last night isn't in yet.");
    expect(SLEEP_COPY.stillSyncing(true)).toBe("Last night isn't in yet. Syncing…");
    expect(SLEEP_COPY.notEnoughNights(3)).toBe('Not enough nights yet. 3 more to go.');
  });
});
