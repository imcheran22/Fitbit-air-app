import React from 'react';
import { render } from '@testing-library/react-native';
import { ScoreDetailScreen } from '../../src/screens/ScoreDetailScreen';
import { fetchScoreDetail } from '../../src/api/scores';

jest.mock('../../src/api/scores');

const mockReplace = jest.fn();
// One object across renders, as React Navigation gives, so effects keyed on it run once.
const mockNavigation = { setOptions: jest.fn(), replace: mockReplace };
let mockParams: unknown;

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// A redirect shim (spec §5.1 #15, §5.3): SLEEP has the Sleep page, RECOVERY the Recovery page.
describe('ScoreDetailScreen', () => {
  it('replaces itself with the Sleep page on that day for type SLEEP, without fetching the score', () => {
    mockParams = { date: '2026-09-19', type: 'SLEEP' };

    const { toJSON } = render(<ScoreDetailScreen />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('Sleep', { date: '2026-09-19' });
    expect(fetchScoreDetail).not.toHaveBeenCalled();
    expect(toJSON()).toBeNull();
  });

  it('replaces itself with Recovery for type RECOVERY, without fetching the score', () => {
    mockParams = { date: '2026-09-19', type: 'RECOVERY' };

    const { toJSON } = render(<ScoreDetailScreen />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('Recovery', { date: '2026-09-19' });
    expect(fetchScoreDetail).not.toHaveBeenCalled();
    expect(toJSON()).toBeNull();
  });

  it('replaces itself with Recovery when the route has no type, without fetching the score', () => {
    mockParams = { date: '2026-09-19' };

    const { toJSON } = render(<ScoreDetailScreen />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('Recovery', { date: '2026-09-19' });
    expect(fetchScoreDetail).not.toHaveBeenCalled();
    expect(toJSON()).toBeNull();
  });
});
