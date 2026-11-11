import React from 'react';
import { AppState } from 'react-native';
import { render } from '@testing-library/react-native';
import { SocialStoreScope } from '../../src/components/social/SocialStoreScope';
import { pingPresence } from '../../src/api/chats';
import { refreshSocial, resetSocial } from '../../src/lib/socialStore';

jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(() => Promise.resolve()), resetSocial: jest.fn() }));
jest.mock('../../src/api/chats', () => ({ pingPresence: jest.fn(() => Promise.resolve()) }));
const refresh = refreshSocial as jest.Mock;
const reset = resetSocial as jest.Mock;

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

it('loads the Social home on mount', () => {
  render(<SocialStoreScope />);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});

it('reloads on a return to the foreground only', () => {
  render(<SocialStoreScope />);
  onAppState!('background');
  onAppState!('inactive');
  expect(refresh).toHaveBeenCalledTimes(1);
  onAppState!('active');
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('forgets the Social home and stops listening on unmount (sign out)', () => {
  const { unmount } = render(<SocialStoreScope />);
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
});

it('tells the server I am active on start and on each return to the foreground', () => {
  render(<SocialStoreScope />);
  expect(pingPresence).toHaveBeenCalledTimes(1);
  onAppState!('background');
  onAppState!('active');
  expect(pingPresence).toHaveBeenCalledTimes(2);
});
