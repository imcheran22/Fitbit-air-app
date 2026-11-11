import type { Achievement } from '@prisma/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { toAchievementsDTO } from '../../src/achievements/dto';

const day = civilDateToUtcMidnight;
const row = (over: Partial<Achievement>): Achievement => ({
  id: 'a1', userId: 'u1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day('2026-10-03'), weekStart: day('2026-09-28'),
  monthStart: day('2026-10-01'), createdAt: new Date('2026-10-03T08:00:00Z'), celebratedAt: null, ...over,
});

it('answers every family in catalogue order with its level, ladder, progress and next threshold', () => {
  const dto = toAchievementsDTO('2026-10-01', [{ family: 'SLEEP_GOAL', current: 9, best: 11 }], [
    row({}),
    row({ id: 'a2', level: 2, value: 7, earnedOn: day('2026-10-07'), celebratedAt: new Date('2026-10-07T09:00:00Z') }),
  ]);
  expect(dto.since).toBe('2026-10-01');
  expect(dto.families.map((f) => f.family)).toEqual(['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);
  expect(dto.families[0]).toEqual({
    family: 'SLEEP_GOAL', kind: 'streak', level: 2, thresholds: [3, 7, 14, 30, 100],
    levels: [{ level: 1, value: 3, earnedOn: '2026-10-03' }, { level: 2, value: 7, earnedOn: '2026-10-07' }],
    current: 9, best: 11, nextThreshold: 14,
  });
  expect(dto.families[3]).toEqual({ family: 'CHECK_IN', kind: 'streak', level: 0, thresholds: [7, 14, 30, 60, 180], levels: [], current: 0, best: 0, nextThreshold: 7 });
  expect(dto.families[6]).toMatchObject({ family: 'STEADIEST_MONTH', kind: 'monthly', thresholds: [1, 2, 4, 6, 12] });
  expect(dto.uncelebrated).toEqual([{ id: 'a1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' }]);
});

it('has no next threshold at the top level, and lists uncelebrated rows in catalogue then level order', () => {
  const rows = [row({ id: 'c1', family: 'CHECK_IN', level: 1, value: 7 }), ...[5, 4, 3, 2, 1].map((l) => row({ id: `s${l}`, level: l, value: [3, 7, 14, 30, 100][l - 1]! }))];
  const dto = toAchievementsDTO('2026-10-01', [], rows);
  expect(dto.families[0]!.level).toBe(5);
  expect(dto.families[0]!.nextThreshold).toBeNull();
  expect(dto.uncelebrated.map((u) => u.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 'c1']);
});
