import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';
import { ThemeToggle } from '../../src/components/ui/theme-toggle';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

jest.mock('expo-secure-store');
jest.mock('nativewind', () => ({
  colorScheme: { set: jest.fn() },
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ThemeToggle', () => {
  it('starts dark, then cycles dark -> system -> light and persists each choice', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeToggle color="#000" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('dark'));

    fireEvent.press(getByTestId('theme-toggle-button'));
    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('system'));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('themePreference', 'system');

    fireEvent.press(getByTestId('theme-toggle-button'));
    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('light'));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('themePreference', 'light');
  });

  it('restores a previously persisted preference on mount', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('dark');

    render(
      <ThemeProvider>
        <ThemeToggle color="#000" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('dark'));
  });
});
