import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiFetch } from '../../src/api/client';
import { ForecastScreen } from '../../src/screens/ForecastScreen';
import { READY } from '../../jest-mocks/forecastFixture';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const increment = (testID: string) =>
  fireEvent(screen.getByTestId(testID), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

describe('ForecastScreen', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('renders the default forecast, band and track record', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByTestId('forecast-band')).toHaveTextContent('Likely 40–80'));
    expect(screen.getByText('Within ±6 on 24 of the last 30 days')).toBeTruthy();
    expect(screen.getByText('An estimate from your own history — not medical advice.')).toBeTruthy();
  });

  it('updates the forecast locally when a lever crosses the threshold (no refetch)', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-ALCOHOL'));
    const before = screen.getByTestId('forecast-score-value').props.accessibilityLabel;
    increment('lever-ALCOHOL'); // 0 -> 1: below threshold, no change
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).toBe(before);
    increment('lever-ALCOHOL'); // 1 -> 2: crosses
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).not.toBe(before);
    expect(screen.getAllByText('2 drinks').length).toBeGreaterThan(0);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows lever values in the same words as the Why bars', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-ALCOHOL'));
    increment('lever-ALCOHOL'); // 0 -> 1
    expect(screen.getByText('1 drink')).toBeTruthy();
    expect(screen.getByTestId('lever-ALCOHOL').props.accessibilityValue.text).toBe('1 drink');
    expect(screen.getByTestId('lever-SLEEP').props.accessibilityValue.text).toBe('7.5 h');
  });

  it('captions levers the forecast does not model', async () => {
    const levers = READY.levers.map((l) => (l.key === 'WORKOUT' ? { ...l, effect: 'NOT_MODELLED' } : l));
    (apiFetch as jest.Mock).mockResolvedValue({ ...READY, levers });
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-WORKOUT'));
    expect(screen.getByText('Not included in this forecast')).toBeTruthy();
    expect(screen.getAllByText('No measurable effect for you yet')).toHaveLength(1);
  });

  it('greys out levers without a measured effect', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-CAFFEINE'));
    expect(screen.getAllByText('No measurable effect for you yet')).toHaveLength(2);
  });

  it('resets every lever to the defaults', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-ALCOHOL'));
    const before = screen.getByTestId('forecast-score-value').props.accessibilityLabel;
    increment('lever-ALCOHOL');
    increment('lever-ALCOHOL');
    fireEvent.press(screen.getByText('Reset'));
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).toBe(before);
  });

  it('shows the not-enough-data state', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 9 });
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByText('Forecast unlocks after 21 days of data (9/21)')).toBeTruthy());
  });

  it('shows an error state when the request fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('boom'));
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toBeTruthy());
  });
});
