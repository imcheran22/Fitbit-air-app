import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchIdentity, saveIdentity } from '../../src/api/buddies';
import { refreshBuddies } from '../../src/lib/buddiesStore';
import { BuddyIdentityScreen } from '../../src/screens/BuddyIdentityScreen';

jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), fetchIdentity: jest.fn(), saveIdentity: jest.fn() }));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }) }));
const mockToastShow = jest.fn();
jest.mock('../../src/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

const SAM = { handle: 'sam', displayName: 'Sam', displayNamePrefill: '', moodNoticeSeen: true };

beforeEach(() => {
  jest.clearAllMocks();
  (fetchIdentity as jest.Mock).mockResolvedValue(SAM);
});

it('a failed load offers a retry that loads the form', async () => {
  (fetchIdentity as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  render(<BuddyIdentityScreen />);
  expect(await screen.findByTestId('buddy-identity-screen-error')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('buddy-identity-screen-retry')));
  expect(await screen.findByTestId('handle-setup')).toBeTruthy();
  expect(fetchIdentity).toHaveBeenCalledTimes(2);
});

it('saving with nothing changed just goes back: no save, no toast', async () => {
  render(<BuddyIdentityScreen />);
  const saveButton = await screen.findByTestId('handle-setup-save');
  await act(async () => fireEvent.press(saveButton));
  expect(saveIdentity).not.toHaveBeenCalled();
  expect(mockToastShow).not.toHaveBeenCalled();
  expect(refreshBuddies).not.toHaveBeenCalled();
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('a real change saves, refreshes, says Saved and goes back', async () => {
  (saveIdentity as jest.Mock).mockResolvedValue({ ...SAM, displayName: 'Sammy' });
  render(<BuddyIdentityScreen />);
  fireEvent.changeText(await screen.findByTestId('display-name-input'), 'Sammy');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(saveIdentity).toHaveBeenCalledWith({ displayName: 'Sammy' });
  expect(refreshBuddies).toHaveBeenCalledTimes(1);
  expect(mockToastShow).toHaveBeenCalledWith('Saved', 'success');
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
