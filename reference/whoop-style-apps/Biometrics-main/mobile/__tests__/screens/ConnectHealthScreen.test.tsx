import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { ConnectHealthScreen } from '../../src/screens/ConnectHealthScreen';
import { apiFetch } from '../../src/api/client';
import { syncTimezone } from '../../src/lib/timezone';

jest.mock('expo-web-browser');
jest.mock('../../src/api/client');
jest.mock('../../src/lib/timezone');

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

describe('ConnectHealthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the authorize URL and navigates to the tabs on success', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'biometrics://health/callback?status=connected',
    });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs'));
    expect(apiFetch).toHaveBeenCalledWith('/health/authorize');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
      'biometrics://health/callback',
    );
  });

  it('does not navigate when the user dismisses the auth session', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(syncTimezone).not.toHaveBeenCalled();
  });

  it('syncs the time zone right after a successful connect', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'biometrics://health/callback?status=connected',
    });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs'));
    expect(syncTimezone).toHaveBeenCalledTimes(1);
  });

  it('shows a readable error instead of an unhandled rejection when the authorize request fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('Request to /health/authorize failed with 500'));

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(getByTestId('connect-health-error')).toBeTruthy());
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('tells the user to sign in again when the session has expired', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('Session expired, please sign in again'));

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(getByTestId('connect-health-error')).toBeTruthy());
    expect(JSON.stringify(getByTestId('connect-health-error').props.children)).toMatch(/sign in again/i);
  });

  it('lets the user try again after an error, and clears the error when they do', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { getByTestId, queryByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));
    await waitFor(() => expect(getByTestId('connect-health-error')).toBeTruthy());

    (apiFetch as jest.Mock).mockResolvedValueOnce({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'biometrics://health/callback?status=connected',
    });
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Tabs'));
    expect(queryByTestId('connect-health-error')).toBeNull();
  });

  it('ignores a second press while a connect is already in flight', async () => {
    let release!: (v: { url: string }) => void;
    (apiFetch as jest.Mock).mockReturnValue(new Promise((resolve) => (release = resolve)));
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));
    fireEvent.press(getByTestId('connect-health-button'));

    release({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a callback that came back without the connected status', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'biometrics://health/callback?status=error',
    });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(getByTestId('connect-health-error')).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows no error when the user simply dismisses the browser', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    const { getByTestId, queryByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
    expect(queryByTestId('connect-health-error')).toBeNull();
  });
});

describe('ConnectHealthScreen: character', () => {
  it("shows the user's character", () => {
    const utils = render(withCharacter(<ConnectHealthScreen />, { characterId: 'kit' }));

    expect(characterLabel(utils, 'connect-health-character')).toBe('character:kit:idle:72:playing:none');
  });
});
