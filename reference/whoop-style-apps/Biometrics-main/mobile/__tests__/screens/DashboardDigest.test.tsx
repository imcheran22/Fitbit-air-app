import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../../src/screens/DashboardScreen';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { fetchCoachStatus, fetchLatestDigest, type CoachStatusDTO } from '../../src/api/coach';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('../../src/api/coach');

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

const digest = { id: 'd1', text: 'A steady week overall.', createdAt: '2026-09-20T12:00:00.000Z' };

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
    // No recaps: the Home shelf and the avatar ring stay quiet (a test overrides this to match the digest).
    if (path.startsWith('/me/recaps')) return Promise.resolve({ recaps: [] });
    return Promise.resolve([{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }]);
  });
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (fetchLatestDigest as jest.Mock).mockResolvedValue(digest);
});

describe('DashboardScreen: weekly digest card', () => {
  it('shows the digest when the coach is enabled and consented', async () => {
    const { findByTestId } = render(<DashboardScreen />);

    expect(await findByTestId('coach-digest-preview')).toHaveTextContent('A steady week overall.');
  });

  it("opens that week's story (its last frame offers the full recap) when the digest is the newest week's recap", async () => {
    const base = (apiFetch as jest.Mock).getMockImplementation()!;
    (apiFetch as jest.Mock).mockImplementation((path: string) =>
      path.startsWith('/me/recaps')
        ? Promise.resolve({ recaps: [{ id: 'd1', kind: 'WEEK', periodStart: '2026-09-14', periodEnd: '2026-09-20', line: 'A week.', personaId: null, builtAt: '2026-09-21T09:00:00.000Z', openedAt: 'x' }] })
        : base(path),
    );
    const { findByTestId, getByTestId } = render(<DashboardScreen />);
    await findByTestId('coach-digest-preview');
    await waitFor(() => {
      fireEvent.press(getByTestId('coach-digest-card'));
      expect(mockNavigate).toHaveBeenCalledWith('RecapStory', { id: 'd1' });
    });
  });

  it('is hidden when there is no digest', async () => {
    (fetchLatestDigest as jest.Mock).mockResolvedValue(null);
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('coach-entry-button');
    await waitFor(() => expect(fetchLatestDigest).toHaveBeenCalled());
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('never asks for or shows a digest when the coach is disabled', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    expect(fetchLatestDigest).not.toHaveBeenCalled();
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('never asks for or shows a digest when enabled but not consented', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('coach-entry-button');
    expect(fetchLatestDigest).not.toHaveBeenCalled();
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('never asks for or shows a digest when the status request fails', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    expect(fetchLatestDigest).not.toHaveBeenCalled();
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('shows the Recaps shelf after the habit log and directly above the digest', async () => {
    const { findByTestId, toJSON } = render(<DashboardScreen />);
    await findByTestId('coach-digest-card');
    await findByTestId('recap-shelf');
    const tree = JSON.stringify(toJSON());
    const habitLog = tree.indexOf('habit-log');
    const shelf = tree.indexOf('recap-shelf');
    const digestCard = tree.indexOf('coach-digest-card');
    expect(habitLog).toBeGreaterThanOrEqual(0);
    expect(digestCard).toBeGreaterThanOrEqual(0);
    expect(habitLog).toBeLessThan(shelf);
    expect(shelf).toBeLessThan(digestCard);
  });

  it('orders Home F: scene, Today, tiles, Ask Coach, habit log, Recaps, digest, metrics', async () => {
    const { findByTestId, toJSON } = render(<DashboardScreen />);
    await findByTestId('coach-digest-card');
    const tree = JSON.stringify(toJSON());
    const ids = ['home-scene', 'home-today', 'home-tiles', 'coach-entry-button', 'habit-log', 'recap-shelf', 'coach-digest-card', 'metric-card-STEPS'];
    const order = ids.map((id) => tree.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('still shows the Recaps shelf when the coach is off', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    expect(await findByTestId('recap-shelf')).toBeTruthy();
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('a failing digest request does not disturb the rest of the dashboard', async () => {
    (fetchLatestDigest as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId } = render(<DashboardScreen />);

    expect(await findByTestId('coach-digest-error')).toBeTruthy();
    expect(await findByTestId('metric-card-STEPS')).toBeTruthy();
  });
});
