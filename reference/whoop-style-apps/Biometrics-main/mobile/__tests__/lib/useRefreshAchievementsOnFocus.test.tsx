import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { useRefreshAchievementsOnFocus } from '../../src/lib/useRefreshAchievementsOnFocus';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
const load = fetchAchievements as jest.Mock;

function Probe() {
  useRefreshAchievementsOnFocus();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  load.mockResolvedValue(achievementsFixture());
});

it('loads on mount without a navigator', async () => {
  render(<Probe />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
});

it('loads again on each focus and stops listening on unmount', async () => {
  const focus: Array<() => void> = [];
  const unsubscribe = jest.fn();
  const navigation = {
    addListener: jest.fn((_event: string, cb: () => void) => {
      focus.push(cb);
      return unsubscribe;
    }),
  };
  const view = render(
    <NavigationContext.Provider value={navigation as never}>
      <Probe />
    </NavigationContext.Provider>,
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(navigation.addListener).toHaveBeenCalledWith('focus', expect.any(Function));
  await act(async () => focus.forEach((cb) => cb()));
  expect(load).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
