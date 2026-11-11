import { apiFetch } from '../../src/api/client';
import { fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity, saveSleepGoal } from '../../src/api/sleep';
import { DEFAULT_SCORE_BANDS } from '../../src/lib/scoreInsights';

jest.mock('../../src/api/client', () => ({
  ...jest.requireActual('../../src/api/client'),
  apiFetch: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

const night = {
  date: '2026-10-01',
  minutesAsleep: 420,
  minutesInBed: 450,
  bedtime: '23:10',
  wakeTime: '06:40',
  sleepScore: 80,
};

describe('fetchSleep', () => {
  it('requests the date range and passes the stage fields through', async () => {
    const stageMinutes = { deep: 60, light: 240, rem: 100, awake: 20 };
    (apiFetch as jest.Mock).mockResolvedValue({
      nights: [{ ...night, minutesAwake: 20, stageMinutes, hasStages: true }],
      earliestDate: '2026-01-01',
      stagesBackfillPending: true,
    });

    await expect(fetchSleep('2026-09-01', '2026-10-01')).resolves.toEqual({
      nights: [{ ...night, minutesAwake: 20, stageMinutes, hasStages: true, mainMinutesAsleep: 420, mainIsNap: false }],
      earliestDate: '2026-01-01',
      stagesBackfillPending: true,
      bands: DEFAULT_SCORE_BANDS,
      today: null,
    });
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep?from=2026-09-01&to=2026-10-01');
  });

  it('normalises an older server without the stage fields', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ nights: [night], earliestDate: '2026-01-01' });

    await expect(fetchSleep('2026-09-01', '2026-10-01')).resolves.toEqual({
      nights: [{ ...night, minutesAwake: null, stageMinutes: null, hasStages: false, mainMinutesAsleep: 420, mainIsNap: false }],
      earliestDate: '2026-01-01',
      stagesBackfillPending: false,
      bands: DEFAULT_SCORE_BANDS,
      today: null,
    });
  });
});

describe('fetchSleepNight', () => {
  it('requests the night by date', async () => {
    const detail = { date: '2026-10-01', hasStages: false, stages: [], stageTotals: null, naps: [] };
    (apiFetch as jest.Mock).mockResolvedValue(detail);

    // An older server sends no session offsets: they read as unknown.
    await expect(fetchSleepNight('2026-10-01')).resolves.toEqual({ ...detail, startUtcOffsetSeconds: null, endUtcOffsetSeconds: null, mainIsNap: false });
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep/night/2026-10-01');
  });

  it('passes the session offsets through', async () => {
    const detail = { date: '2026-10-01', hasStages: false, stages: [], stageTotals: null, naps: [], startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -18000 };
    (apiFetch as jest.Mock).mockResolvedValue(detail);

    await expect(fetchSleepNight('2026-10-01')).resolves.toEqual({ ...detail, mainIsNap: false });
  });
});

describe('fetchSleep: one-page fields', () => {
  it('passes the server fields through', async () => {
    const bands = { excellent: 80, good: 60, fair: 45 };
    (apiFetch as jest.Mock).mockResolvedValue({
      nights: [{ ...night, mainMinutesAsleep: 400, mainIsNap: true }], earliestDate: null, stagesBackfillPending: false, bands, today: '2026-10-08',
    });
    const res = await fetchSleep('2026-10-01', '2026-10-08');
    expect(res.nights[0]).toMatchObject({ minutesAsleep: 420, mainMinutesAsleep: 400, mainIsNap: true });
    expect(res.bands).toEqual(bands);
    expect(res.today).toBe('2026-10-08');
  });

  it('falls back to the day total when the server has no main session for the date', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ nights: [{ ...night, mainMinutesAsleep: null, mainIsNap: false }], earliestDate: null });
    expect((await fetchSleep('2026-10-01', '2026-10-01')).nights[0]!.mainMinutesAsleep).toBe(420);
  });
});

describe('fetchSleepNight: nap flag', () => {
  it('defaults mainIsNap to false for an older server and passes true through', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ date: '2026-10-01', naps: [] }).mockResolvedValueOnce({ date: '2026-10-01', naps: [], mainIsNap: true });
    expect((await fetchSleepNight('2026-10-01')).mainIsNap).toBe(false);
    expect((await fetchSleepNight('2026-10-01')).mainIsNap).toBe(true);
  });
});

describe('fetchSleepRegularity', () => {
  it('requests the window in days', async () => {
    const regularity = { days: 7, nights: 0, score: null, drift: [] };
    (apiFetch as jest.Mock).mockResolvedValue(regularity);

    await expect(fetchSleepRegularity(7)).resolves.toEqual(regularity);
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep/regularity?days=7');
  });
});

describe('sleep goal', () => {
  const goal = { sleepGoalMinutes: 480, bedtimeGoal: '23:00', wakeGoal: null };

  it('fetches the goal', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(goal);

    await expect(fetchSleepGoal()).resolves.toEqual(goal);
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep/goal');
  });

  it('PUTs a partial goal as JSON and returns the saved goal', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(goal);

    await expect(saveSleepGoal({ bedtimeGoal: '23:00' })).resolves.toEqual(goal);
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep/goal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bedtimeGoal: '23:00' }),
    });
  });
});
