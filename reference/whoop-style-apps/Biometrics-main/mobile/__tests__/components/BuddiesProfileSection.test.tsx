import React from 'react';
import { NavigationContext } from '@react-navigation/native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { consentToSharing, fetchBuddyPage, fetchIdentity, fetchSharing, saveSharing } from '../../src/api/buddies';
import { BuddiesProfileSection } from '../../src/components/buddies/BuddiesProfileSection';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchBuddyPage: jest.fn(),
  fetchIdentity: jest.fn(),
  fetchSharing: jest.fn(),
  saveSharing: jest.fn(),
  consentToSharing: jest.fn(),
}));

const OFF = { recovery: false, sleepScore: false, hoursSlept: false, steps: false, streaks: false };
const PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };
const coded = (code: string) => Object.assign(new Error(code), { code });

beforeEach(async () => {
  jest.clearAllMocks();
  resetBuddies();
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'sam', displayName: 'Sam', displayNamePrefill: '', moodNoticeSeen: true });
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: false, ...OFF });
});

it('is hidden against a backend without buddies', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(null);
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  await act(async () => { await refreshBuddies(); });
  expect(screen.queryByTestId('buddies-settings')).toBeNull();
});

it('shows the buddy name and opens edit and the blocked list', async () => {
  const onNavigate = jest.fn();
  render(<BuddiesProfileSection onNavigate={onNavigate} />);
  expect(await screen.findByText('Sam')).toBeTruthy();
  expect(screen.getByText('@sam')).toBeTruthy();
  fireEvent.press(screen.getByTestId('buddy-identity-row'));
  fireEvent.press(screen.getByTestId('blocked-people-row'));
  expect(onNavigate.mock.calls).toEqual([['BuddyIdentity'], ['BlockedPeople']]);
});

it('has no Buddies row: the Social tab is the way in now', async () => {
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  expect(await screen.findByTestId('buddy-identity-row')).toBeTruthy();
  expect(screen.queryByTestId('buddies-row')).toBeNull();
});

it('re-reads identity and sharing on focus, not on every buddies refresh', async () => {
  const focus = new Set<() => void>();
  const navigation = { addListener: (_: 'focus', cb: () => void) => (focus.add(cb), () => focus.delete(cb)) };
  render(
    <NavigationContext.Provider value={navigation as never}>
      <BuddiesProfileSection onNavigate={jest.fn()} />
    </NavigationContext.Provider>,
  );
  expect(await screen.findByText('Sam')).toBeTruthy();
  expect(fetchIdentity).toHaveBeenCalledTimes(1);
  expect(fetchSharing).toHaveBeenCalledTimes(1);
  // Another screen refreshes the shared list (a new page object): no extra reads here.
  (fetchBuddyPage as jest.Mock).mockResolvedValue({ ...PAGE, incomingRequests: 1 });
  await act(async () => { await refreshBuddies(); });
  expect(fetchIdentity).toHaveBeenCalledTimes(1);
  expect(fetchSharing).toHaveBeenCalledTimes(1);
  // Back from editing the buddy name: the new name shows.
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'sam', displayName: 'Sammy', displayNamePrefill: '', moodNoticeSeen: true });
  await act(async () => focus.forEach((cb) => cb()));
  expect(await screen.findByText('Sammy')).toBeTruthy();
  expect(fetchIdentity).toHaveBeenCalledTimes(2);
  expect(fetchSharing).toHaveBeenCalledTimes(2);
});

it('consent accepted but the save fails: the switch stays off, the sheet closes, and it explains', async () => {
  (consentToSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  (saveSharing as jest.Mock).mockRejectedValue(coded('try_later'));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-steps'), 'valueChange', true);
  await act(async () => fireEvent.press(await screen.findByTestId('sharing-consent-agree')));
  expect(saveSharing).toHaveBeenCalledWith({ steps: true });
  expect(screen.queryByTestId('sharing-consent')).toBeNull();
  expect(screen.getByTestId('share-toggle-steps').props.value).toBe(false);
  expect(screen.getByTestId('share-toggle-steps').props.disabled).toBe(false);
  expect(screen.getByText("Couldn't do that right now. Try again in a minute.")).toBeTruthy();
});

it('a consent refused for a newer server version drops the pending switch: a later reload never reopens the sheet', async () => {
  const focus = new Set<() => void>();
  const navigation = { addListener: (_: 'focus', cb: () => void) => (focus.add(cb), () => focus.delete(cb)) };
  (consentToSharing as jest.Mock).mockRejectedValue(coded('stale_consent_version'));
  render(
    <NavigationContext.Provider value={navigation as never}>
      <BuddiesProfileSection onNavigate={jest.fn()} />
    </NavigationContext.Provider>,
  );
  fireEvent(await screen.findByTestId('share-toggle-steps'), 'valueChange', true);
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 2, consented: false, ...OFF });
  await act(async () => fireEvent.press(await screen.findByTestId('sharing-consent-agree')));
  await waitFor(() => expect(screen.getByTestId('share-toggle-steps').props.disabled).toBe(true));
  expect(screen.queryByTestId('sharing-consent')).toBeNull();
  // The server goes back to the app's version (e.g. a rollback): the old ask must not come back.
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: false, ...OFF });
  await act(async () => focus.forEach((cb) => cb()));
  await waitFor(() => expect(screen.getByTestId('share-toggle-steps').props.disabled).toBe(false));
  expect(screen.queryByTestId('sharing-consent')).toBeNull();
  expect(saveSharing).not.toHaveBeenCalled();
});

it('the first switch turned on asks for consent, then saves; turning one off never asks', async () => {
  (consentToSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  (saveSharing as jest.Mock).mockImplementation(async (patch: object) => ({ consentVersion: 1, consented: true, ...OFF, ...patch }));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-steps'), 'valueChange', true);
  expect(await screen.findByTestId('sharing-consent')).toBeTruthy();
  expect(saveSharing).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('sharing-consent-agree')));
  expect(consentToSharing).toHaveBeenCalledWith(1);
  expect(saveSharing).toHaveBeenCalledWith({ steps: true });
  await waitFor(() => expect(screen.getByTestId('share-toggle-steps').props.value).toBe(true));
  await act(async () => fireEvent(screen.getByTestId('share-toggle-steps'), 'valueChange', false));
  expect(saveSharing).toHaveBeenLastCalledWith({ steps: false });
  expect(consentToSharing).toHaveBeenCalledTimes(1);
});

it('after a consent-version bump the sheet comes back; a newer server version locks the switches', async () => {
  (fetchSharing as jest.Mock).mockResolvedValueOnce({ consentVersion: 1, consented: false, ...OFF });
  const first = render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-recovery'), 'valueChange', true);
  expect(await screen.findByTestId('sharing-consent')).toBeTruthy();
  first.unmount();

  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 2, consented: false, ...OFF });
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  await waitFor(() => expect(screen.getByTestId('share-toggle-recovery').props.disabled).toBe(true));
  expect(screen.getByText('Update the app to change what you share.')).toBeTruthy();
});

it('declining or closing the consent sheet saves nothing and leaves every switch off', async () => {
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-streaks'), 'valueChange', true);
  expect(await screen.findByTestId('sharing-consent')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('sharing-consent-cancel')));
  expect(screen.queryByTestId('sharing-consent')).toBeNull();
  expect(consentToSharing).not.toHaveBeenCalled();
  expect(saveSharing).not.toHaveBeenCalled();
  expect(screen.getByTestId('share-toggle-streaks').props.value).toBe(false);
});

it('a double tap on agree consents once and saves once', async () => {
  let resolveConsent!: (v: unknown) => void;
  (consentToSharing as jest.Mock).mockImplementation(() => new Promise((r) => { resolveConsent = r; }));
  (saveSharing as jest.Mock).mockImplementation(async (patch: object) => ({ consentVersion: 1, consented: true, ...OFF, ...patch }));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-steps'), 'valueChange', true);
  const agree = await screen.findByTestId('sharing-consent-agree');
  fireEvent.press(agree);
  fireEvent.press(agree);
  expect(consentToSharing).toHaveBeenCalledTimes(1);
  await act(async () => resolveConsent({ consentVersion: 1, consented: true, ...OFF }));
  await waitFor(() => expect(screen.getByTestId('share-toggle-steps').props.value).toBe(true));
  expect(saveSharing).toHaveBeenCalledTimes(1);
});

it('a double flip saves once; a failed save keeps the server value and explains', async () => {
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF, sleepScore: true });
  let reject!: (e: unknown) => void;
  (saveSharing as jest.Mock).mockImplementation(() => new Promise((_, r) => { reject = r; }));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  const toggle = await screen.findByTestId('share-toggle-sleepScore');
  await waitFor(() => expect(screen.getByTestId('share-toggle-sleepScore').props.value).toBe(true));
  fireEvent(toggle, 'valueChange', false);
  fireEvent(toggle, 'valueChange', false);
  fireEvent(screen.getByTestId('share-toggle-steps'), 'valueChange', true);
  expect(saveSharing).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('share-toggle-sleepScore').props.disabled).toBe(true);
  await act(async () => reject(coded('try_later')));
  expect(screen.getByTestId('share-toggle-sleepScore').props.value).toBe(true);
  expect(screen.getByTestId('share-toggle-sleepScore').props.disabled).toBe(false);
  expect(screen.getByText("Couldn't do that right now. Try again in a minute.")).toBeTruthy();
});

it('a switch is never shown on unless the server confirmed it', async () => {
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  // The server answers with the switch still off (e.g. its consent moved on in between).
  (saveSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  const toggle = await screen.findByTestId('share-toggle-hoursSlept');
  await act(async () => fireEvent(toggle, 'valueChange', true));
  expect(saveSharing).toHaveBeenCalledWith({ hoursSlept: true });
  expect(screen.getByTestId('share-toggle-hoursSlept').props.value).toBe(false);
});

it.each(['consent_required', 'stale_consent_version'])('a %s answer shows the consent sheet again, not an error', async (code) => {
  (fetchSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  (saveSharing as jest.Mock).mockRejectedValue(coded(code));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  const toggle = await screen.findByTestId('share-toggle-recovery');
  await act(async () => fireEvent(toggle, 'valueChange', true));
  expect(await screen.findByTestId('sharing-consent')).toBeTruthy();
  expect(screen.getByTestId('share-toggle-recovery').props.value).toBe(false);
  expect(screen.queryByText(/Confirm what your buddies|has changed/)).toBeNull();

  // Agreeing now consents and saves the same switch.
  (consentToSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF });
  (saveSharing as jest.Mock).mockResolvedValue({ consentVersion: 1, consented: true, ...OFF, recovery: true });
  await act(async () => fireEvent.press(screen.getByTestId('sharing-consent-agree')));
  expect(consentToSharing).toHaveBeenCalledWith(1);
  await waitFor(() => expect(screen.getByTestId('share-toggle-recovery').props.value).toBe(true));
});

it('a refused consent shows the sheet again and saves nothing', async () => {
  (consentToSharing as jest.Mock).mockRejectedValue(coded('stale_consent_version'));
  render(<BuddiesProfileSection onNavigate={jest.fn()} />);
  fireEvent(await screen.findByTestId('share-toggle-steps'), 'valueChange', true);
  const agree = await screen.findByTestId('sharing-consent-agree');
  await act(async () => fireEvent.press(agree));
  expect(consentToSharing).toHaveBeenCalledTimes(1);
  expect(saveSharing).not.toHaveBeenCalled();
  expect(screen.getByTestId('sharing-consent')).toBeTruthy();
  expect(screen.getByTestId('share-toggle-steps').props.value).toBe(false);
});
