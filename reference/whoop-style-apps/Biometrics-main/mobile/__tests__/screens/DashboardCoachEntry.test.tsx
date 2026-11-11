import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../../src/screens/DashboardScreen';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { fetchCoachStatus, type CoachStatusDTO } from '../../src/api/coach';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('../../src/api/coach');
jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(() => Promise.resolve([])), markRecapOpened: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'mochi',
  personaChosen: true,
  personas: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ session: { userId: 'u1', email: 'u1@example.com' }, signOut: jest.fn() });
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/me/forecast') return Promise.resolve({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 0 });
    if (path === '/me/connection') return Promise.resolve({ status: 'CONNECTED' });
    if (path.startsWith('/me/habits')) {
      return Promise.resolve(path === '/me/habits/config' ? { habitTypes: [] } : { today: '2026-09-20', days: [] });
    }
    if (path.startsWith('/me/scores')) return Promise.resolve({ scores: [] });
    return Promise.resolve([{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }]);
  });
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
});

describe('DashboardScreen: AI Coach entry', () => {
  it('opens the chat when the coach is enabled and consented', async () => {
    const { findByTestId } = render(<DashboardScreen />);

    fireEvent.press(await findByTestId('coach-entry-button'));

    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach' }, { pop: true });
  });

  it('opens the consent flow when enabled but not yet consented', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId } = render(<DashboardScreen />);

    fireEvent.press(await findByTestId('coach-entry-button'));

    expect(mockNavigate).toHaveBeenCalledWith('CoachConsent');
  });

  it('is entirely absent when the coach is disabled, and the dashboard is unaffected', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId, queryByTestId, queryByText } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    expect(queryByTestId('coach-entry-button')).toBeNull();
    expect(queryByText(/AI Coach/i)).toBeNull();
  });

  it('is absent when the status request fails', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    expect(queryByTestId('coach-entry-button')).toBeNull();
  });
});
