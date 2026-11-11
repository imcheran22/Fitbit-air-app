import fetch from 'node-fetch';
import { BiometricMetricType, HealthMetricPoint, SleepSessionPoint, SleepStagePoint } from '../types';
import { parseUtcOffsetSeconds } from '../biometrics/civilDate';

const BASE_URL = 'https://health.googleapis.com/v4';

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  // A well-formed YYYY-MM-DD always yields three finite numbers; anything
  // else is a caller bug and must fail loudly rather than send Google a
  // request body with `null`/`NaN` date parts.
  if (
    year === undefined || month === undefined || day === undefined ||
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
  ) {
    throw new Error(`Invalid date string "${dateStr}": expected YYYY-MM-DD`);
  }
  return { year, month, day };
}

// Confirmed live on heart-rate: "The duration covered by window_size_days *
// page_size must not exceed 14 days for heart-rate" (INVALID_ROLLUP_QUERY_DURATION).
// Applied uniformly to every dailyRollUp-backed metric rather than only
// heart-rate, since steps' own undiscovered cap (if any) is unconfirmed and
// chunking is harmless when a metric's real limit is higher.
const MAX_DAILY_ROLLUP_WINDOW_DAYS = 14;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

async function dailyRollUpChunk(
  accessToken: string,
  parentDataType: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/users/me/dataTypes/${parentDataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      range: { start: { date: parseDate(startDate) }, end: { date: parseDate(endDate) } },
      windowSizeDays: 1,
    }),
  });
  if (!res.ok) {
    const err = new Error(`Google Health dailyRollUp returned ${res.status} for ${parentDataType}`);
    (err as any).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { rollupDataPoints?: any[] };
  return json.rollupDataPoints ?? [];
}

async function dailyRollUp(
  accessToken: string,
  parentDataType: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  // Validate eagerly, before the chunking loop's date arithmetic (which
  // tolerates malformed strings as NaN and would otherwise silently return
  // an empty result instead of throwing).
  parseDate(startDate);
  parseDate(endDate);
  const results: any[] = [];
  let chunkStart = startDate;
  while (daysBetween(chunkStart, endDate) > 0) {
    const remaining = daysBetween(chunkStart, endDate);
    const chunkEnd = remaining > MAX_DAILY_ROLLUP_WINDOW_DAYS ? addDays(chunkStart, MAX_DAILY_ROLLUP_WINDOW_DAYS) : endDate;
    const rows = await dailyRollUpChunk(accessToken, parentDataType, chunkStart, chunkEnd);
    results.push(...rows);
    chunkStart = chunkEnd;
  }
  return results;
}

// dataPoints.list returns ONE page per call and signals more with
// `nextPageToken`. Confirmed live (2026-09-21): a 30-day sleep window holds 25
// sessions but the first page carries only 12, so a caller that ignores the
// token silently loses the rest. Follow the token until it is absent or empty
// (`pageToken` is the confirmed query parameter). The cap turns a token that
// never ends into an error instead of an endless loop; 50 pages is far beyond
// any real backfill window.
const MAX_LIST_PAGES = 50;

async function listAllPages(url: string, accessToken: string, dataType: string): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const pageUrl = pageToken ? `${url}&${new URLSearchParams({ pageToken }).toString()}` : url;
    const res = await fetch(pageUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const err = new Error(`Google Health dataPoints.list returned ${res.status} for ${dataType}`);
      (err as any).status = res.status;
      throw err;
    }
    const json = (await res.json()) as { dataPoints?: any[]; nextPageToken?: string };
    items.push(...(json.dataPoints ?? []));
    if (!json.nextPageToken) return items;
    pageToken = json.nextPageToken;
  }
  throw new Error(`Google Health dataPoints.list for ${dataType} still had more pages after ${MAX_LIST_PAGES}`);
}

async function listDataPoints(
  accessToken: string,
  dataType: string,
  filterField: 'interval.end_time',
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const filter = `${dataType}.${filterField} >= "${startDate}T00:00:00Z" AND ${dataType}.${filterField} < "${endDate}T00:00:00Z"`;
  const url = `${BASE_URL}/users/me/dataTypes/${dataType}/dataPoints?${new URLSearchParams({ filter }).toString()}`;
  return listAllPages(url, accessToken, dataType);
}

function civilDateToDate(civil: { date: { year: number; month: number; day: number } }): Date {
  const { year, month, day } = civil.date;
  return new Date(Date.UTC(year, month - 1, day));
}

// HRV is a daily pre-aggregated data type in the live API, not sample-based:
// confirmed live that `dailyRollUp` explicitly rejects it ("DailyRollup is
// not supported for data type heart-rate-variability, only list/reconcile
// supported"), and that its data lives under a *separate* collection,
// `daily-heart-rate-variability` (hyphenated in the URL), filtered by a
// `daily_heart_rate_variability.date` (underscored) civil-date literal --
// not `heart-rate-variability` with a sample-time filter. Both the URL
// segment and the filter's data-type token were confirmed against real
// responses from a live Fitbit-linked account, including the response
// field name `dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds`.
async function listDailyHeartRateVariability(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const filter = `daily_heart_rate_variability.date >= "${startDate}" AND daily_heart_rate_variability.date < "${endDate}"`;
  const url = `${BASE_URL}/users/me/dataTypes/daily-heart-rate-variability/dataPoints?${new URLSearchParams({ filter }).toString()}`;
  return listAllPages(url, accessToken, 'daily-heart-rate-variability');
}

// Resting heart rate is Google's own dedicated daily type (confirmed live,
// HTTP 200), replacing the old daily-minimum-BPM rollup of `heart-rate`, which
// ran ~12 bpm below true resting HR and showed single-reading artifacts. Same
// shape as daily HRV: a hyphenated collection URL and an underscored
// `daily_resting_heart_rate.date` civil-date filter. Each point carries
// `dailyRestingHeartRate.beatsPerMinute` (a numeric string) and a
// `calculationMethod` of WITH_SLEEP or ONLY_WITH_AWAKE_DATA, which is not used.
async function listDailyRestingHeartRate(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const filter = `daily_resting_heart_rate.date >= "${startDate}" AND daily_resting_heart_rate.date < "${endDate}"`;
  const url = `${BASE_URL}/users/me/dataTypes/daily-resting-heart-rate/dataPoints?${new URLSearchParams({ filter }).toString()}`;
  return listAllPages(url, accessToken, 'daily-resting-heart-rate');
}

// Metrics Google delivers as one pre-aggregated value per civil day. SLEEP is
// deliberately excluded: it is fetched as whole sessions by fetchSleepSessions
// and its daily value is derived by us (see biometrics/repository.ts).
export type DailyMetricType = Exclude<BiometricMetricType, 'SLEEP'>;

export async function fetchMetricRange(
  accessToken: string,
  metricType: DailyMetricType,
  startDate: string,
  endDate: string,
): Promise<HealthMetricPoint[]> {
  switch (metricType) {
    case 'STEPS': {
      const rows = await dailyRollUp(accessToken, 'steps', startDate, endDate);
      return rows
        .filter((r) => r.steps?.countSum !== undefined)
        .map((r) => ({ recordedAt: civilDateToDate(r.civilStartTime), value: Number(r.steps.countSum) }));
    }
    case 'RESTING_HR': {
      const rows = await listDailyRestingHeartRate(accessToken, startDate, endDate);
      // One data point per day, like HRV. beatsPerMinute is a numeric string;
      // a row without a finite value cannot be scored and is skipped.
      const points: HealthMetricPoint[] = [];
      for (const r of rows) {
        const day = r.dailyRestingHeartRate;
        const raw = day?.beatsPerMinute;
        const bpm = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
        // Number('') is 0, so blank strings are rejected explicitly.
        if (!day?.date || String(raw).trim() === '' || !Number.isFinite(bpm)) continue;
        points.push({ recordedAt: civilDateToDate(day), value: bpm });
      }
      return points;
    }
    case 'HRV': {
      const rows = await listDailyHeartRateVariability(accessToken, startDate, endDate);
      // Already one data point per day (a daily pre-aggregated type, not
      // sample-based -- see listDailyHeartRateVariability's comment), so no
      // day-grouping is needed: each row maps directly to one HealthMetricPoint.
      return rows
        .filter((r) => r.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds !== undefined)
        .map((r) => ({
          recordedAt: civilDateToDate(r.dailyHeartRateVariability),
          value: r.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds as number,
        }));
    }
  }
}

// Stage types the SleepStageType enum stores; anything else (e.g. SNORING) is skipped.
const STAGE_TYPES = new Set(['AWAKE', 'LIGHT', 'DEEP', 'REM']);

// Google sends counts as numeric strings; '' and garbage become null, never 0.
function numOrNull(v: unknown): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stageMinutes(summary: any, type: string): number | null {
  const row = Array.isArray(summary?.stagesSummary) ? summary.stagesSummary.find((r: any) => r?.type === type) : undefined;
  return row ? numOrNull(row.minutes) : null;
}

/**
 * Fetches raw sleep sessions in [startDate, endDate) (same half-open
 * convention as fetchMetricRange), one entry per Google `Sleep` object.
 *
 * Confirmed live: `sleep.interval.start_time` is explicitly rejected ("Member
 * 'sleep.interval.start_time' is not supported for filtering") -- sleep is one
 * of the types the API documents as excluded from the generic
 * interval-start-time filter pattern, so the window filters on
 * `sleep.interval.end_time` instead. `summary.minutesAsleep` is a numeric
 * string ("468"), the same string-encoded-int64 pattern as steps' countSum.
 *
 * Sessions are returned as-is rather than keyed to a day here. Every record
 * carries `interval.startUtcOffset` / `endUtcOffset` ("-14400s", verified
 * live), parsed to seconds and returned so the day key can follow the record's
 * own local time; a null offset means the caller falls back to the user's
 * timezone. Rows missing either interval bound or minutesAsleep are skipped
 * (they cannot be keyed or summed) rather than defaulted.
 * It also reads the stage timeline and night summary (spec 2026-10-03 §1).
 */
export async function fetchSleepSessions(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<SleepSessionPoint[]> {
  const rows = await listDataPoints(accessToken, 'sleep', 'interval.end_time', startDate, endDate);
  const sessions: SleepSessionPoint[] = [];
  for (const r of rows) {
    const interval = r.sleep?.interval;
    const minutes = r.sleep?.summary?.minutesAsleep;
    // `== null` on purpose: Google sends an explicit null for a night it
    // recorded but could not summarise, and Number(null) is 0 -- which passes
    // the isFinite guard below and stores a real night as zero minutes asleep.
    if (!interval?.startTime || !interval?.endTime || minutes == null) continue;
    const startTime = new Date(interval.startTime);
    const endTime = new Date(interval.endTime);
    const minutesAsleep = Number(minutes);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || !Number.isFinite(minutesAsleep)) continue;
    sessions.push({
      startTime,
      endTime,
      minutesAsleep,
      // Malformed or absent offsets are null (never NaN); the day key then falls back to User.timezone.
      startUtcOffsetSeconds: parseUtcOffsetSeconds(interval.startUtcOffset),
      endUtcOffsetSeconds: parseUtcOffsetSeconds(interval.endUtcOffset),
      sleepType: typeof r.sleep?.type === 'string' ? r.sleep.type : null,
      mainSleep: typeof r.sleep?.metadata?.mainSleep === 'boolean' ? r.sleep.metadata.mainSleep : null,
      minutesInSleepPeriod: numOrNull(r.sleep?.summary?.minutesInSleepPeriod),
      minutesAwake: numOrNull(r.sleep?.summary?.minutesAwake),
      minutesToFallAsleep: numOrNull(r.sleep?.summary?.minutesToFallAsleep),
      minutesAfterWakeUp: numOrNull(r.sleep?.summary?.minutesAfterWakeUp),
      deepMinutes: stageMinutes(r.sleep?.summary, 'DEEP'),
      lightMinutes: stageMinutes(r.sleep?.summary, 'LIGHT'),
      remMinutes: stageMinutes(r.sleep?.summary, 'REM'),
      awakeMinutes: stageMinutes(r.sleep?.summary, 'AWAKE'),
      stages: (Array.isArray(r.sleep?.stages) ? r.sleep.stages : [])
        .filter((g: any) => STAGE_TYPES.has(g?.type) && g.startTime && g.endTime)
        .map((g: any) => ({ type: g.type, startTime: new Date(g.startTime), endTime: new Date(g.endTime) }))
        .filter((g: SleepStagePoint) => !Number.isNaN(g.startTime.getTime()) && !Number.isNaN(g.endTime.getTime()) && g.endTime > g.startTime)
        .sort((a: SleepStagePoint, b: SleepStagePoint) => a.startTime.getTime() - b.startTime.getTime()),
    });
  }
  return sessions;
}
