import { apiFetch } from './client';

export interface HabitTypeDTO {
  type: string;
  label: string;
  unit: string;
  exposureThreshold: number;
  builtIn: boolean;
}

export interface HabitLogDTO {
  id: string;
  habitType: string;
  // 0 is a real "none" entry, not a missing value.
  value: number;
  unit: string;
  loggedAt: string;
  // Derived by the server (04:00-local boundary); the client only displays it.
  habitDay: string; // YYYY-MM-DD
  note: string | null;
}

export interface LogHabitInput {
  habitType: string;
  value: number;
  unit?: string;
  note?: string;
  loggedAt?: string; // ISO
}

export interface CreateHabitTypeInput {
  label: string;
  unit: string;
  exposureThreshold: number;
}

export interface HabitStatusDayDTO {
  habitDay: string;
  checkedIn: boolean;
  // habitType -> whether that habit is observed (logged, or covered by a check-in).
  observed: Record<string, boolean>;
}

export interface HabitStatusDTO {
  today: string; // the current habit day
  days: HabitStatusDayDTO[];
}

export type PatternFactor = 'HRV' | 'RHR' | 'SLEEP_DURATION' | 'SLEEP_EFFICIENCY' | 'CIRCADIAN_CONSISTENCY';

export interface PatternSeriesDTO {
  days: string[];
  habit: number[]; // 0 | 1 exposure indicator
  factor: (number | null)[];
}

// Only CONFIRMED patterns are ever returned; the server applies the
// two-consecutive-runs persistence rule.
export interface PatternDTO {
  habitType: string;
  exposureThreshold: number;
  exposureUnit: string;
  factor: PatternFactor;
  factorLabel: string;
  lagDays: number; // 1..3
  effectSizePercent: number;
  comparisonPercent: number;
  sampleSize: number;
  direction: 'higher' | 'lower';
  series: PatternSeriesDTO;
}

export interface NotEnoughDataDTO {
  habitType: string;
  exposedDays: number;
  unexposedDays: number;
  requiredEach: number;
}

export interface PatternsDTO {
  patterns: PatternDTO[];
  notEnoughData: NotEnoughDataDTO[];
}

function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function fetchHabitConfig(): Promise<HabitTypeDTO[]> {
  const res = await apiFetch<{ habitTypes?: HabitTypeDTO[] }>('/me/habits/config');
  return res?.habitTypes ?? [];
}

export async function createHabitType(input: CreateHabitTypeInput): Promise<HabitTypeDTO> {
  const res = await apiFetch<{ habitType: HabitTypeDTO }>('/me/habits/types', jsonPost(input));
  return res.habitType;
}

export async function logHabit(input: LogHabitInput): Promise<HabitLogDTO> {
  const res = await apiFetch<{ log: HabitLogDTO }>('/me/habits/logs', jsonPost(input));
  return res.log;
}

export async function fetchHabitLogs(from: string, to: string): Promise<HabitLogDTO[]> {
  const res = await apiFetch<{ logs?: HabitLogDTO[] }>(`/me/habits/logs?from=${from}&to=${to}`);
  return res?.logs ?? [];
}

export async function deleteHabitLog(id: string): Promise<void> {
  await apiFetch<void>(`/me/habits/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Omit habitDay for today's habit day. The server allows the previous 7 days.
export async function createCheckIn(habitDay?: string): Promise<{ habitDay: string }> {
  const res = await apiFetch<{ checkIn: { habitDay: string } }>('/me/habits/check-ins', jsonPost(habitDay ? { habitDay } : {}));
  return res.checkIn;
}

export async function fetchHabitStatus(days = 14): Promise<HabitStatusDTO> {
  const res = await apiFetch<Partial<HabitStatusDTO>>(`/me/habits/status?days=${days}`);
  return { today: res?.today ?? '', days: res?.days ?? [] };
}

export async function fetchPatterns(): Promise<PatternsDTO> {
  const res = await apiFetch<Partial<PatternsDTO>>('/me/habits/patterns');
  return { patterns: res?.patterns ?? [], notEnoughData: res?.notEnoughData ?? [] };
}
