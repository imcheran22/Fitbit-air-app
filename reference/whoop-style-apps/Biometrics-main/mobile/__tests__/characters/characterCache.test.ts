import * as SecureStore from 'expo-secure-store';
import {
  clearCachedCharacter,
  readCachedCharacter,
  readCachedThinking,
  writeCachedCharacter,
  writeCachedThinking,
} from '../../src/characters/characterCache';

jest.mock('expo-secure-store');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('readCachedCharacter', () => {
  it('returns the stored character', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('kit');

    await expect(readCachedCharacter()).resolves.toBe('kit');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('characterId');
  });

  it('returns null when nothing is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(readCachedCharacter()).resolves.toBeNull();
  });

  it('returns null for an id this app does not know (e.g. from a newer build)', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('twinkle');

    await expect(readCachedCharacter()).resolves.toBeNull();
  });

  it('returns null, and does not reject, when the keychain read fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('A required entitlement is not present'));

    await expect(readCachedCharacter()).resolves.toBeNull();
  });
});

describe('writeCachedCharacter', () => {
  it('stores the id under characterId', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await writeCachedCharacter('boba');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('characterId', 'boba');
  });

  it('does not reject when the keychain write fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('locked'));

    await expect(writeCachedCharacter('boba')).resolves.toBeUndefined();
  });
});

describe('clearCachedCharacter', () => {
  it('deletes the characterId entry', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    await clearCachedCharacter();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('characterId');
  });

  it('also deletes the thinking settings, even when the character delete fails', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(undefined);

    await clearCachedCharacter();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('thinking');
  });

  it('does not reject when the keychain delete fails', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('locked'));

    await expect(clearCachedCharacter()).resolves.toBeUndefined();
  });
});

describe('readCachedThinking', () => {
  it('reads cached thinking settings and replaces unknown ids with the defaults', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({ attachment: 'gears', text: 'nope' }));
    await expect(readCachedThinking()).resolves.toEqual({ attachment: 'gears', text: 'steps' });
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('thinking');

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({ attachment: 7, text: 'dialog' }));
    await expect(readCachedThinking()).resolves.toEqual({ attachment: 'bulb', text: 'dialog' });
  });

  it('returns null when nothing is stored, the entry is not JSON, or the read fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    await expect(readCachedThinking()).resolves.toBeNull();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not json');
    await expect(readCachedThinking()).resolves.toBeNull();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('null');
    await expect(readCachedThinking()).resolves.toBeNull();
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await expect(readCachedThinking()).resolves.toBeNull();
  });
});

describe('writeCachedThinking', () => {
  it('stores the settings as JSON under thinking', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await writeCachedThinking({ attachment: 'clock', text: 'tag' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('thinking', JSON.stringify({ attachment: 'clock', text: 'tag' }));
  });

  it('does not reject when the keychain write fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('locked'));

    await expect(writeCachedThinking({ attachment: 'clock', text: 'tag' })).resolves.toBeUndefined();
  });
});
