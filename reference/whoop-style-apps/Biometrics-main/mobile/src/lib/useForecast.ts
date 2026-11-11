import { useEffect, useState } from 'react';
import { fetchForecast, type ForecastDTO } from '../api/forecast';

export type ForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; forecast: ForecastDTO };

/**
 * The single way screens load the forecast. Pass the sync `dataVersion` (or any
 * key) to refetch after new data arrives; the previous result stays on screen
 * while the refetch is in flight, so cards never flash back to a skeleton.
 */
export function useForecast(refreshKey: unknown = 0): ForecastState {
  const [state, setState] = useState<ForecastState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetchForecast()
      .then((forecast) => {
        if (!cancelled) setState({ status: 'loaded', forecast });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => (prev.status === 'loaded' ? prev : { status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return state;
}
