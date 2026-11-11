import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DashboardScreen } from '../../src/screens/DashboardScreen';
import { ScoreRing } from '../../src/components/ui/score-ring';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { COLORS } from '../../src/theme';
import { todayCivil } from '../../src/lib/heatmap';

// The band decides the ring colour; expose that colour so it can be asserted.
jest.mock('../../src/components/ui/ring', () => {
  const { View } = require('react-native');
  return {
    Ring: ({ color, children }: { color: string; children?: React.ReactNode }) => (
      <View testID="ring-stub" accessibilityLabel={color}>
        {children}
      </View>
    ),
  };
});
jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
// Home's Recaps shelf fetches on mount; keep it inert.
jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(() => Promise.resolve([])), markRecapOpened: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
}));

const SERVER_BANDS = { excellent: 90, good: 70, fair: 50 };
// Home counts only today's Recovery score.
const recovery = {
  date: todayCivil(),
  type: 'RECOVERY',
  score: 78,
  confidenceLevel: 'HIGH',
  algorithmVersion: 'v1',
  factors: [{ factor: 'HRV', label: 'HRV', z: 1.2, weight: 0.45, contribution: 0.54, points: 8.2, imputed: false, excluded: false }],
  coldStart: [],
};
const steps = [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }];

function mockDashboardApi(scoresResponse: unknown) {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/me/forecast') return Promise.resolve({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 0 });
    if (path === '/me/connection') return Promise.resolve({ status: 'CONNECTED' });
    if (path.startsWith('/me/habits')) return Promise.reject(new Error('n/a'));
    if (path.startsWith('/me/scores')) return Promise.resolve(scoresResponse);
    return Promise.resolve(steps);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ signOut: jest.fn() });
});

type Query = (id: string) => { props: { accessibilityLabel?: string } };
const ringColor = (getByTestId: Query) => getByTestId('ring-stub').props.accessibilityLabel;

describe('ScoreRing bands', () => {
  it('uses the default bands when none are given (78 is Excellent)', () => {
    const { getByTestId } = render(<ScoreRing score={78} />);
    expect(ringColor(getByTestId)).toBe(COLORS.light.scoreExcellent);
  });

  it('uses the given bands (78 is only Good when excellent starts at 90)', () => {
    const { getByTestId } = render(<ScoreRing score={78} bands={SERVER_BANDS} />);
    expect(ringColor(getByTestId)).toBe(COLORS.light.scoreGood);
  });
});

describe('Dashboard score bands', () => {
  const tileColour = () => StyleSheet.flatten(screen.getByTestId('home-tile-recovery-line').props.style).color;

  it('colours the Recovery tile with the default bands when the server sends the defaults', async () => {
    mockDashboardApi({ scores: [recovery], bands: { excellent: 75, good: 55, fair: 40 } });
    render(<DashboardScreen />);
    await screen.findByTestId('home-tile-recovery-line');
    expect(tileColour()).toBe(COLORS.light.scoreExcellent);
  });

  it('picks a different band when the server sends different thresholds', async () => {
    mockDashboardApi({ scores: [recovery], bands: SERVER_BANDS });
    render(<DashboardScreen />);
    await screen.findByTestId('home-tile-recovery-line');
    expect(tileColour()).toBe(COLORS.light.scoreGood);
  });

  it('falls back to the defaults when the server sends no bands', async () => {
    mockDashboardApi({ scores: [recovery] });
    render(<DashboardScreen />);
    await screen.findByTestId('home-tile-recovery-line');
    expect(tileColour()).toBe(COLORS.light.scoreExcellent);
  });
});
