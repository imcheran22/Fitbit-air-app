import {
  buildCheckInStrip,
  dayOfMonth,
  parseHabitValue,
  stepValue,
  weekdayInitial,
  withCheckIn,
  withObserved,
} from '../../src/lib/habitDays';
import type { HabitStatusDTO, HabitTypeDTO } from '../../src/api/habits';

const types: HabitTypeDTO[] = [
  { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true },
  { type: 'CAFFEINE', label: 'Caffeine', unit: 'cups', exposureThreshold: 3, builtIn: true },
];

function status(): HabitStatusDTO {
  const days = [];
  // 2026-09-06 .. 2026-09-20 (15 days); today is the 20th.
  for (let d = 6; d <= 20; d++) {
    days.push({ habitDay: `2026-09-${String(d).padStart(2, '0')}`, checkedIn: false, observed: { ALCOHOL: false, CAFFEINE: false } });
  }
  return { today: '2026-09-20', days };
}

describe('weekdayInitial / dayOfMonth', () => {
  it('reads the civil date without any time zone shift', () => {
    expect(weekdayInitial('2026-09-20')).toBe('S'); // a Sunday
    expect(weekdayInitial('2026-09-21')).toBe('M');
    expect(dayOfMonth('2026-09-05')).toBe('5');
  });
});

describe('buildCheckInStrip', () => {
  it('lists the 7 days before today, oldest first, excluding today', () => {
    const strip = buildCheckInStrip(status(), types);

    expect(strip.map((d) => d.habitDay)).toEqual([
      '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19',
    ]);
  });

  it('marks a checked-in day done', () => {
    const s = status();
    s.days.find((d) => d.habitDay === '2026-09-18')!.checkedIn = true;

    const strip = buildCheckInStrip(s, types);

    expect(strip.find((d) => d.habitDay === '2026-09-18')!.done).toBe(true);
    expect(strip.find((d) => d.habitDay === '2026-09-17')!.done).toBe(false);
  });

  it('marks a day done when every habit type is observed, but not when only some are', () => {
    const s = status();
    s.days.find((d) => d.habitDay === '2026-09-18')!.observed = { ALCOHOL: true, CAFFEINE: true };
    s.days.find((d) => d.habitDay === '2026-09-17')!.observed = { ALCOHOL: true, CAFFEINE: false };

    const strip = buildCheckInStrip(s, types);

    expect(strip.find((d) => d.habitDay === '2026-09-18')!.done).toBe(true);
    expect(strip.find((d) => d.habitDay === '2026-09-17')!.done).toBe(false);
  });

  it('never marks a day done from an empty habit list alone', () => {
    expect(buildCheckInStrip(status(), []).every((d) => !d.done)).toBe(true);
  });

  it('is empty when the server has not told us what today is', () => {
    expect(buildCheckInStrip({ today: '', days: [] }, types)).toEqual([]);
  });
});

describe('withCheckIn / withObserved', () => {
  it('marks a day checked in without mutating the original', () => {
    const original = status();
    const next = withCheckIn(original, '2026-09-20');

    expect(next.days.find((d) => d.habitDay === '2026-09-20')!.checkedIn).toBe(true);
    expect(original.days.find((d) => d.habitDay === '2026-09-20')!.checkedIn).toBe(false);
  });

  it('adds the day when the status did not list it', () => {
    const next = withCheckIn({ today: '2026-09-20', days: [] }, '2026-09-20');

    expect(next.days).toEqual([{ habitDay: '2026-09-20', checkedIn: true, observed: {} }]);
  });

  it('marks one habit type observed for a day', () => {
    const next = withObserved(status(), '2026-09-20', 'ALCOHOL');
    const day = next.days.find((d) => d.habitDay === '2026-09-20')!;

    expect(day.observed).toEqual({ ALCOHOL: true, CAFFEINE: false });
    expect(day.checkedIn).toBe(false);
  });
});

describe('parseHabitValue', () => {
  it('treats empty input as not entered', () => {
    expect(parseHabitValue('')).toBeNull();
    expect(parseHabitValue('   ')).toBeNull();
  });

  it('accepts 0 as a real value and decimals with either separator', () => {
    expect(parseHabitValue('0')).toBe(0);
    expect(parseHabitValue('2.5')).toBe(2.5);
    expect(parseHabitValue('2,5')).toBe(2.5);
  });

  it('rejects negatives and non-numbers', () => {
    expect(parseHabitValue('-1')).toBeNaN();
    expect(parseHabitValue('abc')).toBeNaN();
  });
});

describe('stepValue', () => {
  it('steps up from empty as if it were 0', () => {
    expect(stepValue('', 1, 1)).toBe('1');
    expect(stepValue('', 1, 5)).toBe('5');
  });

  it('steps down but never below 0', () => {
    expect(stepValue('2', -1, 1)).toBe('1');
    expect(stepValue('0', -1, 1)).toBe('0');
    expect(stepValue('', -1, 1)).toBe('0');
  });

  it('avoids floating point noise', () => {
    expect(stepValue('0.1', 1, 0.2)).toBe('0.3');
  });

  it('recovers from unparseable input by starting at 0', () => {
    expect(stepValue('abc', 1, 1)).toBe('1');
  });
});
