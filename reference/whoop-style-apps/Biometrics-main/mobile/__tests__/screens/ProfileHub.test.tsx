import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { fetchIdentity } from '../../src/api/buddies';
import { getTimezoneState } from '../../src/lib/timezone';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/achievements');
jest.mock('../../src/api/buddies');
jest.mock('../../src/api/notifications');
jest.mock('../../src/api/recaps');

const navigate = jest.fn();
const navigation = { navigate, addListener: jest.fn(() => () => undefined) };

async function open() {
  render(
    <NavigationContext.Provider value={navigation as never}>
      <SettingsScreen />
    </NavigationContext.Provider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'Europe/London', overridden: false });
  (fetchIdentity as jest.Mock).mockResolvedValue({
    handle: 'tushar',
    displayName: 'Tushar',
    displayNamePrefill: '',
    moodNoticeSeen: true,
    checkInStreak: 12,
    buddyCount: 3,
    joinedOn: '2026-03-14',
  });
});

it('heads the page Profile and fills the passport from the identity and time zone', async () => {
  await open();

  expect(screen.getByRole('header', { name: 'Profile' })).toHaveTextContent('PROFILE');
  expect(screen.getByTestId('passport-number')).toHaveTextContent(/^NO\. KIP-[A-Z0-9]{4}$/);
  expect(screen.getByTestId('passport-name')).toHaveTextContent('Tushar');
  expect(screen.getByTestId('passport-handle')).toHaveTextContent('@tushar');
  expect(screen.getByTestId('passport-home')).toHaveTextContent('Europe/London');
  expect(screen.getByTestId('passport-joined')).toHaveTextContent('14 MAR 2026');
  expect(screen.getByTestId('passport-streak')).toHaveTextContent('12 days');
  expect(screen.getByTestId('passport-buddies')).toHaveTextContent('3');
});

it('shows dashes against an older server that sends no streak, buddies or join date', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'tushar', displayName: 'Tushar', displayNamePrefill: '', moodNoticeSeen: true });
  await open();

  expect(screen.getByTestId('passport-streak')).toHaveTextContent('—');
  expect(screen.getByTestId('passport-buddies')).toHaveTextContent('—');
  expect(screen.getByTestId('passport-joined')).toHaveTextContent('—');
});

it('opens the identity editor from Edit', async () => {
  await open();
  fireEvent.press(screen.getByTestId('passport-edit'));
  expect(navigate).toHaveBeenCalledWith('BuddyIdentity', undefined);
});

it('shows the category cards with their status, and each opens its section', async () => {
  await open();

  expect(screen.getByTestId('profile-category-timezone-status')).toHaveTextContent('Device · Europe/London');
  expect(screen.getByTestId('profile-category-signIn')).toBeTruthy();
  fireEvent.press(screen.getByTestId('profile-category-timezone'));
  expect(navigate).toHaveBeenCalledWith('ProfileSection', { section: 'timezone' });
  fireEvent.press(screen.getByTestId('profile-category-coach'));
  expect(navigate).toHaveBeenCalledWith('ProfileSection', { section: 'coach' });
});

it('ends with Delete account and the note on what deleting removes', async () => {
  await open();

  expect(screen.getByTestId('delete-account-open')).toHaveTextContent('Delete account');
  expect(screen.getByText('Deleting removes your account and all the data stored for it.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('delete-account-open'));
  expect(screen.getByTestId('delete-account-warning')).toBeTruthy();
});
