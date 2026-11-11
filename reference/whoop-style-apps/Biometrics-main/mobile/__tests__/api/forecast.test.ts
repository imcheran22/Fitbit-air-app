import { apiFetch } from '../../src/api/client';
import { fetchForecast } from '../../src/api/forecast';
import { READY } from '../../jest-mocks/forecastFixture';

jest.mock('../../src/api/client', () => ({ ...jest.requireActual('../../src/api/client'), apiFetch: jest.fn() }));

describe('fetchForecast', () => {
  it('GETs /me/forecast and returns both variants unchanged', async () => {
    const notEnough = { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 };
    (apiFetch as jest.Mock).mockResolvedValueOnce(notEnough);
    await expect(fetchForecast()).resolves.toEqual(notEnough);
    expect(apiFetch).toHaveBeenCalledWith('/me/forecast');

    (apiFetch as jest.Mock).mockResolvedValueOnce(READY);
    await expect(fetchForecast()).resolves.toEqual(READY);
  });
});
