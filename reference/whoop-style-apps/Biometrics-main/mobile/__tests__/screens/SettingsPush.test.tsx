import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { ProfileSectionScreen } from '../../src/screens/ProfileSectionScreen';
import type { ProfileCategory } from '../../src/lib/profileCopy';
import { fetchCoachStatus, type CoachStatusDTO } from '../../src/api/coach';
import { getTimezoneState, listTimeZones } from '../../src/lib/timezone';
import { getPushState, enablePush, disablePush } from '../../src/lib/pushRegistration';
import { fetchNotificationSettings } from '../../src/api/notifications';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/coach');
jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/api/notifications');

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'kit',
  personaChosen: true,
  personas: [{ id: 'kit', name: 'Kit', verbosity: 'terse', proactivity: 'threshold-triggered', tagline: null, greeting: null }],
};

function renderSettings(section: ProfileCategory = 'notifications') {
  return render(
    <NavigationContext.Provider value={{ navigate: jest.fn() } as any}>
      <ProfileSectionScreen route={{ params: { section } }} />
    </NavigationContext.Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'UTC', overridden: false });
  (listTimeZones as jest.Mock).mockReturnValue([]);
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (getPushState as jest.Mock).mockResolvedValue({ status: 'off' });
  (enablePush as jest.Mock).mockResolvedValue({ status: 'on' });
  (disablePush as jest.Mock).mockResolvedValue({ status: 'off' });
  (fetchNotificationSettings as jest.Mock).mockResolvedValue({ recapPushEnabled: true });
});

describe('SettingsScreen: Recap ready notifications', () => {
  it('no longer has a push switch inside the coach section', async () => {
    const { findByTestId, queryByTestId } = renderSettings('aiCoach');
    await findByTestId('coach-settings');
    expect(queryByTestId('push-toggle')).toBeNull();
  });

  it('shows the Recap ready switch with the coach off, and never prompts just from rendering', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId } = renderSettings();
    expect(await findByTestId('recap-ready-row')).toBeTruthy();
    expect(enablePush).not.toHaveBeenCalled();
  });

  it('hides the switch where notifications are unavailable', async () => {
    (getPushState as jest.Mock).mockResolvedValue({ status: 'unavailable', reason: 'no_project_id' });
    const { queryByTestId } = renderSettings();
    await waitFor(() => expect(getPushState).toHaveBeenCalled());
    await waitFor(() => expect(fetchNotificationSettings).toHaveBeenCalled());
    // Let the section's reads settle, so a switch that wrongly renders would be on screen by now.
    await act(async () => {});
    expect(queryByTestId('recap-ready-row')).toBeNull();
  });
});
