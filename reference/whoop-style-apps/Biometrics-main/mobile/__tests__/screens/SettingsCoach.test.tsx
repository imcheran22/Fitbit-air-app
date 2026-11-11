import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { ProfileSectionScreen } from '../../src/screens/ProfileSectionScreen';
import { fetchCoachStatus, revokeCoachConsent, revokeHostedConsent, setCoachPersona, type CoachStatusDTO } from '../../src/api/coach';
import { getTimezoneState, listTimeZones } from '../../src/lib/timezone';
import { withCharacter } from '../../jest-mocks/characterContext';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/coach');

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'kit',
  personaChosen: true,
  personas: [
    { id: 'kit', name: 'Kit', verbosity: 'terse', proactivity: 'threshold-triggered', tagline: null, greeting: null },
    { id: 'mochi', name: 'Mochi', verbosity: 'normal', proactivity: 'threshold-triggered', tagline: null, greeting: null },
  ],
};

const navigate = jest.fn();
const screen = (
  <NavigationContext.Provider value={{ navigate } as any}>
    {/* Profile's Your coach and AI Coach cards each open one of these. */}
    <ProfileSectionScreen route={{ params: { section: 'coach' } }} />
    <ProfileSectionScreen route={{ params: { section: 'aiCoach' } }} />
  </NavigationContext.Provider>
);

// Without a CharacterProvider, useCoachStatus fetches its own copy (phase 4),
// so these tests drive status through the fetchCoachStatus mock.
function renderSettings() {
  return render(screen);
}

beforeEach(() => {
  jest.clearAllMocks();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'UTC', overridden: false });
  (listTimeZones as jest.Mock).mockReturnValue([]);
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (revokeCoachConsent as jest.Mock).mockResolvedValue(undefined);
});

describe('SettingsScreen: Your coach', () => {
  it('shows the current character and opens Meet your coach to switch', async () => {
    const { findByTestId } = render(withCharacter(screen, { characterId: 'kit', status }));

    const row = await findByTestId('your-coach-row');
    expect(row).toHaveTextContent(/Kit/);
    fireEvent.press(row);

    expect(navigate).toHaveBeenCalledWith('MeetYourCoach', { mode: 'switch' });
  });

  it('keeps the row while the coach is disabled, and nothing else about the coach', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId, queryByTestId } = renderSettings();

    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    expect(await findByTestId('your-coach-row')).toHaveTextContent(/Mochi/);
    expect(queryByTestId('coach-settings')).toBeNull();
    expect(queryByTestId('coach-memory-row')).toBeNull();
  });

  it('shows Thinking style and Thinking text under Your coach, with the current choices', async () => {
    const { findByTestId } = render(withCharacter(screen, { characterId: 'kit', status }));

    const group = await findByTestId('your-coach');
    const style = await findByTestId('settings-thinking-style');
    const text = await findByTestId('settings-thinking-text');
    expect(within(group).getByTestId('settings-thinking-style')).toBe(style);
    expect(within(group).getByTestId('settings-thinking-text')).toBe(text);
    expect(style).toHaveTextContent(/Thinking style/);
    expect(style).toHaveTextContent(/Lightbulb/);
    expect(text).toHaveTextContent(/Thinking text/);
    expect(text).toHaveTextContent(/What it's doing/);
  });

  it('names a changed choice and opens the right screen', async () => {
    const { findByTestId } = render(withCharacter(screen, { status, thinkingAttachment: 'gears', thinkingText: 'dialog' }));

    const style = await findByTestId('settings-thinking-style');
    const text = await findByTestId('settings-thinking-text');
    expect(style).toHaveTextContent(/Gears/);
    expect(text).toHaveTextContent(/Retro dialog box/);
    fireEvent.press(style);
    expect(navigate).toHaveBeenCalledWith('ThinkingStyle');
    fireEvent.press(text);
    expect(navigate).toHaveBeenCalledWith('ThinkingText');
  });

  it('no longer has a Coach style picker', async () => {
    const { findByTestId, queryByText, queryByTestId } = renderSettings();

    await findByTestId('coach-revoke-button');
    expect(queryByText('Coach style')).toBeNull();
    expect(queryByTestId('persona-option-mochi')).toBeNull();
    expect(setCoachPersona).not.toHaveBeenCalled();
  });
});

describe('SettingsScreen: AI Coach', () => {
  it('revokes consent with DELETE and switches the section to its "off" state at once', async () => {
    const { findByTestId, queryByTestId } = renderSettings();

    fireEvent.press(await findByTestId('coach-revoke-button'));

    await waitFor(() => expect(revokeCoachConsent).toHaveBeenCalledTimes(1));
    expect(await findByTestId('coach-setup-button')).toBeTruthy();
    expect(queryByTestId('coach-revoke-button')).toBeNull();
    // Optimistic: no second status read was needed.
    expect(fetchCoachStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps consent shown as on, with an error, if revoking fails', async () => {
    (revokeCoachConsent as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId } = renderSettings();

    fireEvent.press(await findByTestId('coach-revoke-button'));

    expect(await findByTestId('coach-revoke-error')).toBeTruthy();
    expect(await findByTestId('coach-revoke-button')).toBeTruthy();
  });

  it('offers to set up the coach (via consent) when enabled but not consented', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId } = renderSettings();

    fireEvent.press(await findByTestId('coach-setup-button'));

    expect(navigate).toHaveBeenCalledWith('CoachConsent');
  });
});

describe('SettingsScreen: AI engine', () => {
  const hosted = { version: 'h1', summary: 'Sent to Anthropic.', dataItems: [] };

  it('offers the engine choice when the server offers Claude, and opens its consent screen', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, engine: 'local', engines: { hosted: { available: true, consented: false, consent: hosted } } });
    const { findByTestId } = renderSettings();

    fireEvent.press(await findByTestId('ai-engine-hosted'));

    expect(navigate).toHaveBeenCalledWith('HostedConsent');
  });

  it('shows no engine choice when only the on-device model is offered', async () => {
    const { findByTestId, queryByTestId } = renderSettings();

    await findByTestId('coach-revoke-button');
    expect(queryByTestId('ai-engine')).toBeNull();
  });
});

describe('SettingsScreen: withdrawing the hosted consent', () => {
  const hosted = { version: 'hosted-1', summary: 'Sent to Anthropic.', dataItems: [] };

  it('withdraws from Profile and shows On-device selected afterwards', async () => {
    (fetchCoachStatus as jest.Mock)
      .mockResolvedValueOnce({ ...status, engine: 'hosted', engines: { hosted: { available: true, consented: true, consent: hosted } } })
      .mockResolvedValue({ ...status, engine: 'local', engines: { hosted: { available: true, consented: false, consent: hosted } } });
    (revokeHostedConsent as jest.Mock).mockResolvedValue(undefined);
    const { findByTestId, getByTestId, queryByTestId } = renderSettings();

    expect((await findByTestId('ai-engine-hosted')).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    fireEvent.press(getByTestId('ai-engine-withdraw'));

    await waitFor(() => expect(revokeHostedConsent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByTestId('ai-engine-withdraw')).toBeNull());
    expect(revokeCoachConsent).not.toHaveBeenCalled();
    expect(getByTestId('ai-engine-local').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId('coach-revoke-button')).toBeTruthy();
  });
});
