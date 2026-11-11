import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSectionScreen } from '../../src/screens/ProfileSectionScreen';
import { FLOATING_BAR_HEIGHT, FLOATING_BAR_MARGIN } from '../../src/navigation/tabBarLayout';
import {
  getTimezoneState,
  setTimezoneOverride,
  clearTimezoneOverride,
  listTimeZones,
} from '../../src/lib/timezone';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/achievements');

const TimezoneScreen = () => <ProfileSectionScreen route={{ params: { section: 'timezone' } }} />;

beforeEach(() => {
  jest.clearAllMocks();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'America/Los_Angeles', overridden: false });
  (listTimeZones as jest.Mock).mockReturnValue(['America/New_York', 'Asia/Tokyo', 'Europe/London']);
  (setTimezoneOverride as jest.Mock).mockResolvedValue(undefined);
  (clearTimezoneOverride as jest.Mock).mockResolvedValue(undefined);
});

describe('Profile → Time zone', () => {
  it('shows the current zone and hides "Use device time zone" while following the device', async () => {
    const { getByTestId, queryByTestId } = render(<TimezoneScreen />);

    await waitFor(() => expect(getByTestId('timezone-value')).toHaveTextContent('America/Los_Angeles'));
    expect(queryByTestId('use-device-timezone-button')).toBeNull();
  });

  it('filters the list by search text and saves the chosen zone as an override', async () => {
    const { getByTestId, queryByTestId } = render(<TimezoneScreen />);
    await waitFor(() => expect(getByTestId('timezone-value')).toBeTruthy());

    fireEvent.press(getByTestId('timezone-row'));
    fireEvent.changeText(getByTestId('timezone-search-input'), 'tokyo');

    expect(queryByTestId('timezone-option-Europe/London')).toBeNull();

    (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'Asia/Tokyo', overridden: true });
    fireEvent.press(getByTestId('timezone-option-Asia/Tokyo'));

    await waitFor(() => expect(setTimezoneOverride).toHaveBeenCalledWith('Asia/Tokyo'));
    await waitFor(() => expect(getByTestId('timezone-value')).toHaveTextContent('Asia/Tokyo'));
    expect(getByTestId('use-device-timezone-button')).toBeTruthy();
  });

  it('"Use device time zone" clears the override', async () => {
    (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'Asia/Tokyo', overridden: true });
    const { getByTestId, queryByTestId } = render(<TimezoneScreen />);
    await waitFor(() => expect(getByTestId('use-device-timezone-button')).toBeTruthy());

    (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'America/Los_Angeles', overridden: false });
    fireEvent.press(getByTestId('use-device-timezone-button'));

    await waitFor(() => expect(clearTimezoneOverride).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('timezone-value')).toHaveTextContent('America/Los_Angeles'));
    expect(queryByTestId('use-device-timezone-button')).toBeNull();
  });

  it('keeps the time zone picker clear of the floating bar', async () => {
    const { getByTestId } = render(<TimezoneScreen />);
    await waitFor(() => expect(getByTestId('timezone-value')).toBeTruthy());

    fireEvent.press(getByTestId('timezone-row'));

    // No SafeAreaProvider here, so the bottom inset falls back to the bar margin.
    const clearance = FLOATING_BAR_HEIGHT + FLOATING_BAR_MARGIN + 16;
    expect(StyleSheet.flatten(getByTestId('timezone-picker').props.style).paddingBottom).toBe(clearance);
  });
});
