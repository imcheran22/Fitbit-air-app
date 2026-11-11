import { apiFetch } from '../../src/api/client';
import {
  createCheckIn,
  createHabitType,
  deleteHabitLog,
  fetchHabitConfig,
  fetchHabitLogs,
  fetchHabitStatus,
  fetchPatterns,
  logHabit,
} from '../../src/api/habits';

jest.mock('../../src/api/client', () => ({
  ...jest.requireActual('../../src/api/client'),
  apiFetch: jest.fn(),
}));

const alcohol = { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true };
const log = {
  id: 'log-1',
  habitType: 'ALCOHOL',
  value: 0,
  unit: 'drinks',
  loggedAt: '2026-09-20T01:00:00.000Z',
  habitDay: '2026-09-19',
  note: null,
};
const jsonPost = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => jest.clearAllMocks());

describe('fetchHabitConfig', () => {
  it('unwraps the habit types', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ habitTypes: [alcohol] });

    await expect(fetchHabitConfig()).resolves.toEqual([alcohol]);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/config');
  });

  it('returns an empty list when the response has none', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({});

    await expect(fetchHabitConfig()).resolves.toEqual([]);
  });
});

describe('createHabitType', () => {
  it('posts the new type and unwraps the created habit type', async () => {
    const input = { label: 'Meditation', unit: 'minutes', exposureThreshold: 10 };
    const created = { type: 'CUSTOM_MEDITATION', ...input, builtIn: false };
    (apiFetch as jest.Mock).mockResolvedValue({ habitType: created });

    await expect(createHabitType(input)).resolves.toEqual(created);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/types', jsonPost(input));
  });
});

describe('logHabit', () => {
  it('posts the log and unwraps it', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ log });

    await expect(logHabit({ habitType: 'ALCOHOL', value: 3, unit: 'drinks' })).resolves.toEqual(log);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/logs', jsonPost({ habitType: 'ALCOHOL', value: 3, unit: 'drinks' }));
  });

  it('sends a value of 0 as a real "none" entry rather than dropping it', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ log });

    await logHabit({ habitType: 'ALCOHOL', value: 0 });

    const body = JSON.parse((apiFetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ habitType: 'ALCOHOL', value: 0 });
    expect(body.value).toBe(0);
  });
});

describe('fetchHabitLogs', () => {
  it('requests the date range and unwraps the logs', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ logs: [log] });

    await expect(fetchHabitLogs('2026-09-13', '2026-09-20')).resolves.toEqual([log]);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/logs?from=2026-09-13&to=2026-09-20');
  });

  it('returns an empty list when the response has none', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({});

    await expect(fetchHabitLogs('2026-09-13', '2026-09-20')).resolves.toEqual([]);
  });
});

describe('deleteHabitLog', () => {
  it('issues a DELETE for the log id', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(undefined);

    await expect(deleteHabitLog('log-1')).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/logs/log-1', { method: 'DELETE' });
  });
});

describe('createCheckIn', () => {
  it('omits habitDay for today and unwraps the check-in', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ checkIn: { habitDay: '2026-09-19' } });

    await expect(createCheckIn()).resolves.toEqual({ habitDay: '2026-09-19' });
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/check-ins', jsonPost({}));
  });

  it('sends habitDay for a retroactive check-in', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ checkIn: { habitDay: '2026-09-15' } });

    await createCheckIn('2026-09-15');

    expect(apiFetch).toHaveBeenCalledWith('/me/habits/check-ins', jsonPost({ habitDay: '2026-09-15' }));
  });
});

describe('fetchHabitStatus', () => {
  it('requests the given number of days', async () => {
    const status = { today: '2026-09-19', days: [{ habitDay: '2026-09-19', checkedIn: false, observed: { ALCOHOL: false } }] };
    (apiFetch as jest.Mock).mockResolvedValue(status);

    await expect(fetchHabitStatus(14)).resolves.toEqual(status);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/status?days=14');
  });

  it('defaults to 14 days and tolerates a malformed response', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({});

    await expect(fetchHabitStatus()).resolves.toEqual({ today: '', days: [] });
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/status?days=14');
  });
});

describe('fetchPatterns', () => {
  it('returns the confirmed patterns and the not-enough-data progress', async () => {
    const response = {
      patterns: [],
      notEnoughData: [{ habitType: 'ALCOHOL', exposedDays: 9, unexposedDays: 3, requiredEach: 8 }],
    };
    (apiFetch as jest.Mock).mockResolvedValue(response);

    await expect(fetchPatterns()).resolves.toEqual(response);
    expect(apiFetch).toHaveBeenCalledWith('/me/habits/patterns');
  });

  it('defaults both lists to empty', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({});

    await expect(fetchPatterns()).resolves.toEqual({ patterns: [], notEnoughData: [] });
  });
});
