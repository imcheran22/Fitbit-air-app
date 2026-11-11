import { formatGoalDuration, goalWindowMinutes, layoutSleepWindow, noonMinutes } from '../../src/lib/sleepWindow';

it('anchors clock times at noon so after-midnight sorts late (Review Focus 1)', () => {
  expect(noonMinutes('12:00')).toBe(0);
  expect(noonMinutes('23:00')).toBe(660);
  expect(noonMinutes('00:30')).toBe(750);
  expect(noonMinutes('07:00')).toBe(1140);
});

it('wraps goal windows across midnight (Review Focus 2)', () => {
  expect(goalWindowMinutes('23:30', '07:00')).toBe(450);
  expect(goalWindowMinutes('00:15', '08:00')).toBe(465);
  expect(goalWindowMinutes('22:00', '06:00')).toBe(480);
});

it('lays bars on the default 21:00–09:00 axis and leaves gaps for missing nights', () => {
  const l = layoutSleepWindow([
    { date: '2026-09-29', bedtime: '23:00', wakeTime: '07:00' },
    { date: '2026-09-30', bedtime: null, wakeTime: null },
    { date: '2026-10-01', bedtime: '00:30', wakeTime: '08:00' },
  ], null);
  expect([l.axisStart, l.axisEnd]).toEqual([540, 1260]);
  expect(l.bars.map((b) => b.date)).toEqual(['2026-09-29', '2026-10-01']);
  expect(l.bars[0]!.top).toBeCloseTo((660 - 540) / 720);
  expect(l.bars[0]!.height).toBeCloseTo(480 / 720);
  expect(l.bars[1]!.top).toBeGreaterThan(l.bars[0]!.top);
  expect(l.goalBand).toBeNull();
});

it('widens the axis to whole hours when a night falls outside it', () => {
  const l = layoutSleepWindow([{ date: '2026-10-01', bedtime: '20:10', wakeTime: '10:40' }], null);
  expect(l.axisStart).toBe(480); // 20:00
  expect(l.axisEnd).toBe(1380);  // 11:00
});

it('draws average lines and the goal band', () => {
  const l = layoutSleepWindow([{ date: 'a', bedtime: '23:00', wakeTime: '07:00' }, { date: 'b', bedtime: '23:30', wakeTime: '07:30' }], { bedtimeGoal: '23:00', wakeGoal: '07:00' });
  expect(l.avgBedtime).toBeCloseTo((675 - 540) / 720);
  expect(l.goalBand).toEqual({ top: (660 - 540) / 720, height: 480 / 720 });
});

it('formats goal durations as {h}h {m}m, dropping 0m', () => {
  expect(formatGoalDuration(480)).toBe('8h');
  expect(formatGoalDuration(450)).toBe('7h 30m');
  expect(formatGoalDuration(425)).toBe('7h 5m');
  expect(formatGoalDuration(45)).toBe('45m');
});
