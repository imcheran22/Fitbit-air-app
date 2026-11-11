import React from 'react';
import { AppState } from 'react-native';
import { render } from '@testing-library/react-native';
import { BuddiesStoreScope } from '../../src/components/buddies/BuddiesStoreScope';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn(() => Promise.resolve()), resetBuddies: jest.fn() }));
const refresh = refreshBuddies as jest.Mock;
const reset = resetBuddies as jest.Mock;

let onAppState: ((s: string) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  onAppState = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    onAppState = fn;
    return { remove };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

it('loads the buddies on mount', () => {
  render(<BuddiesStoreScope />);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});

it('reloads on a return to the foreground only', () => {
  render(<BuddiesStoreScope />);
  onAppState!('background');
  onAppState!('inactive');
  expect(refresh).toHaveBeenCalledTimes(1);
  onAppState!('active');
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('forgets the buddies and stops listening on unmount (sign out)', () => {
  const { unmount } = render(<BuddiesStoreScope />);
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
});
