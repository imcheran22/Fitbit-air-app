import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';
import { restoreThemePreference, applyDefaultThemeSync } from '../../src/theme/preference';

jest.mock('expo-secure-store');
jest.mock('nativewind', () => ({ colorScheme: { set: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('restoreThemePreference', () => {
  it('defaults to dark when nothing is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(restoreThemePreference()).resolves.toBe('dark');
    expect(colorScheme.set).toHaveBeenCalledWith('dark');
  });

  it('defaults to dark when the stored value is not a known preference', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('sepia');

    await expect(restoreThemePreference()).resolves.toBe('dark');
  });

  it('defaults to dark, and does not reject, when reading the stored preference fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('A required entitlement is not present'));

    await expect(restoreThemePreference()).resolves.toBe('dark');
    expect(colorScheme.set).toHaveBeenCalledWith('dark');
  });

  it.each(['light', 'dark', 'system'] as const)('respects a stored "%s" choice', async (stored) => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(stored);

    await expect(restoreThemePreference()).resolves.toBe(stored);
    expect(colorScheme.set).toHaveBeenCalledWith(stored);
  });
});

describe('applyDefaultThemeSync', () => {
  it('sets the NativeWind scheme to dark synchronously', () => {
    applyDefaultThemeSync();

    expect(colorScheme.set).toHaveBeenCalledTimes(1);
    expect(colorScheme.set).toHaveBeenCalledWith('dark');
  });
});
