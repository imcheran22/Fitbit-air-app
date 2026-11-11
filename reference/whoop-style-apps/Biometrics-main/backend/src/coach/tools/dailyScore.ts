import { civilDateToUtcMidnight } from '../../biometrics/civilDate';
import { prisma } from '../../db/client';
import { toDailyScoreDTO } from '../../scoring/dto';
import { shiftDate } from '../../scoring/dates';

export type Direction = 'higher' | 'lower' | 'unchanged';

export interface DailyScoreToolFactor {
  type: 'RECOVERY' | 'SLEEP';
  factor: string;
  label: string;
  z: number | null;
  contribution: number;
  points: number;
  imputed: boolean;
  excluded: boolean;
}

// One day's scores, read-only, as the fact sheet (answer/facts.ts) and the day
// summary build on them. deltaFromYesterday and direction are computed here, on
// the server, never left to the model's arithmetic.
// "Yesterday" is the literal previous civil day; when either day has no score
// there is nothing honest to compare, so the delta and direction are null.
export interface DailyScoreToolResult {
  date: string;
  recoveryScore: number | null;
  sleepScore: number | null;
  factors: DailyScoreToolFactor[];
  /**
   * The same factors keyed by their stable FactorKey (HRV, SLEEP_DURATION, ...).
   * Look factors up here, not by factors[n]: the array is built by skipping a
   * score row that does not exist for the day, so a missing RECOVERY row slides
   * every SLEEP factor down an index and factors[0] is then a different factor.
   * The keys are disjoint across RECOVERY and SLEEP, so one flat map is
   * unambiguous.
   */
  factorsByKey: Record<string, DailyScoreToolFactor>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  deltaFromYesterday: number | null;
  direction: Direction | null;
  sleepDeltaFromYesterday: number | null;
  sleepDirection: Direction | null;
  /** The recovery change as one phrase ("4 points lower than yesterday"), so the model never writes "down -4". */
  changeDisplay: string | null;
  sleepChangeDisplay: string | null;
}

/** Pure: a score delta as a phrase; null when there is nothing to compare. */
export function describeScoreChange(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return 'unchanged from yesterday';
  const size = Math.abs(delta);
  return `${size} point${size === 1 ? '' : 's'} ${delta > 0 ? 'higher' : 'lower'} than yesterday`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pure: the signed difference and its direction from two already-rounded scores. */
export function compareScores(
  today: number | null,
  yesterday: number | null,
): { delta: number | null; direction: Direction | null } {
  if (today === null || yesterday === null) return { delta: null, direction: null };
  const delta = round1(today - yesterday);
  // A delta that rounds to zero is "unchanged": never report "higher by 0".
  return { delta, direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'unchanged' };
}

export async function getDailyScore(userId: string, date: string): Promise<DailyScoreToolResult> {
  const day = civilDateToUtcMidnight(date);
  const yesterday = civilDateToUtcMidnight(shiftDate(date, -1));
  const rows = await prisma.dailyScore.findMany({ where: { userId, date: { in: [day, yesterday] } } });

  const rowFor = (d: Date, type: 'RECOVERY' | 'SLEEP') =>
    rows.find((r) => r.date.getTime() === d.getTime() && r.type === type);
  const scoreOf = (row: (typeof rows)[number] | undefined): number | null =>
    row ? toDailyScoreDTO(row, []).score : null;

  const recovery = rowFor(day, 'RECOVERY');
  const sleep = rowFor(day, 'SLEEP');
  const recoveryScore = scoreOf(recovery);
  const sleepScore = scoreOf(sleep);
  const rec = compareScores(recoveryScore, scoreOf(rowFor(yesterday, 'RECOVERY')));
  const slp = compareScores(sleepScore, scoreOf(rowFor(yesterday, 'SLEEP')));

  const factors: DailyScoreToolFactor[] = [];
  for (const row of [recovery, sleep]) {
    if (!row) continue;
    for (const f of toDailyScoreDTO(row, []).factors) {
      factors.push({
        type: row.type,
        factor: f.factor,
        label: f.label,
        z: f.z,
        contribution: f.contribution,
        points: f.points,
        imputed: f.imputed,
        excluded: f.excluded,
      });
    }
  }

  // Object.fromEntries, not a literal: the keys come from the factor rows that
  // actually exist for this day.
  const factorsByKey: Record<string, DailyScoreToolFactor> = Object.fromEntries(factors.map((f) => [f.factor, f]));

  return {
    date,
    recoveryScore,
    sleepScore,
    factors,
    factorsByKey,
    confidence: (recovery ?? sleep)?.confidenceLevel ?? null,
    deltaFromYesterday: rec.delta,
    direction: rec.direction,
    sleepDeltaFromYesterday: slp.delta,
    sleepDirection: slp.direction,
    changeDisplay: describeScoreChange(rec.delta),
    sleepChangeDisplay: describeScoreChange(slp.delta),
  };
}
