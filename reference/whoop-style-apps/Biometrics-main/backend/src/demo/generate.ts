// Synthetic showcase history (spec section 4). Pure and deterministic per seed.
// Planted effects on the NEXT day: alcohol >= 2 drinks -> HRV -18%, RHR +5 bpm;
// workout -> HRV +4%; caffeine -> nothing. Timezone is UTC.
import { dateRange, shiftDate } from '../scoring/dates';
import type { DailyPoint } from '../scoring/types';

export interface DemoHistory {
  hrv: DailyPoint[];
  rhr: DailyPoint[];
  steps: DailyPoint[];
  /** Minutes asleep keyed by the date the night ends. */
  sleep: DailyPoint[];
  sessions: Array<{ startTime: Date; endTime: Date; minutesAsleep: number }>;
  habitLogs: Array<{ habitType: 'ALCOHOL' | 'CAFFEINE' | 'WORKOUT'; value: number; unit: string; habitDay: string }>;
  checkInDays: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

export function generateDemoHistory({ seed, endDate, days }: { seed: number; endDate: string; days: number }): DemoHistory {
  const rand = mulberry32(seed);
  const dates = dateRange(shiftDate(endDate, -(days - 1)), endDate);
  const out: DemoHistory = { hrv: [], rhr: [], steps: [], sleep: [], sessions: [], habitLogs: [], checkInDays: [] };

  // Habits first, so day d can read habit day d - 1.
  const drank = new Map<string, boolean>();
  const trained = new Map<string, boolean>();
  for (const day of [shiftDate(dates[0]!, -1), ...dates]) {
    const weekendEvening = dow(day) === 5 || dow(day) === 6;
    const drinks = rand() < (weekendEvening ? 0.55 : 0.12) ? 2 + Math.floor(rand() * 3) : rand() < 0.3 ? 1 : 0;
    const workout = rand() < 0.57 ? 30 + Math.floor(rand() * 31) : 0;
    const cups = 1 + Math.floor(rand() * 4);
    drank.set(day, drinks >= 2);
    trained.set(day, workout >= 20);
    if (day < dates[0]!) continue;
    out.checkInDays.push(day);
    if (drinks > 0) out.habitLogs.push({ habitType: 'ALCOHOL', value: drinks, unit: 'drinks', habitDay: day });
    if (workout > 0) out.habitLogs.push({ habitType: 'WORKOUT', value: workout, unit: 'minutes', habitDay: day });
    out.habitLogs.push({ habitType: 'CAFFEINE', value: cups, unit: 'cups', habitDay: day });
  }

  let r = 0;
  for (const date of dates) {
    const prev = shiftDate(date, -1);
    r = 0.6 * r + 0.6 * gauss(rand);
    const alcohol = drank.get(prev)!;
    const workout = trained.get(prev)!;
    const weekendNight = dow(date) === 6 || dow(date) === 0; // nights ending Sat/Sun
    const sleepMin = Math.min(620, Math.max(200, 60 * (7.2 - (weekendNight ? 0.6 : 0) - (alcohol ? 0.3 : 0) + 0.6 * gauss(rand))));
    const hrv = 55 * (1 + 0.12 * r) * (alcohol ? 0.82 : 1) * (workout ? 1.04 : 1) + 1.5 * gauss(rand);
    const rhr = 58 - 2.5 * r + (alcohol ? 5 : 0) + 0.8 * gauss(rand);
    const steps = Math.max(500, Math.round(8000 - (dow(date) === 0 || dow(date) === 6 ? 1500 : 0) + 1500 * gauss(rand)));

    const end = new Date(`${date}T06:45:00Z`);
    end.setUTCMinutes(end.getUTCMinutes() + Math.round(20 * gauss(rand)));
    const start = new Date(end.getTime() - (sleepMin + 25) * 60_000);

    out.hrv.push({ date, value: round1(hrv) });
    out.rhr.push({ date, value: round1(rhr) });
    out.steps.push({ date, value: steps });
    out.sleep.push({ date, value: Math.round(sleepMin) });
    out.sessions.push({ startTime: start, endTime: end, minutesAsleep: Math.round(sleepMin) });
  }
  return out;
}
