import { renderHook, waitFor } from '@testing-library/react-native';
import { apiFetch } from '../../src/api/client';
import { useForecast } from '../../src/lib/useForecast';
import { READY } from '../../jest-mocks/forecastFixture';

jest.mock('../../src/api/client', () => ({ ...jest.requireActual('../../src/api/client'), apiFetch: jest.fn() }));

describe('useForecast', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('goes loading -> loaded', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    const { result } = renderHook(() => useForecast());
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'loaded', forecast: READY }));
  });

  it('reports errors', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useForecast());
    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });

  it('refetches when refreshKey changes and keeps the last result meanwhile', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    const { result, rerender } = renderHook(({ k }: { k: number }) => useForecast(k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    (apiFetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    rerender({ k: 1 });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loaded');
  });
});
