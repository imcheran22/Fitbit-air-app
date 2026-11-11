import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { captureToPng, saveImage, shareImage } from '../../src/lib/recapCapture';

const capture = makeImageFromView as jest.Mock;
const perms = MediaLibrary.getPermissionsAsync as jest.Mock;
const request = MediaLibrary.requestPermissionsAsync as jest.Mock;
const files = (File as unknown as { instances: Array<{ uri: string; write: jest.Mock; create: jest.Mock }> }).instances;
const permission = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? 'granted' : canAskAgain ? 'undetermined' : 'denied' });

beforeEach(() => {
  jest.clearAllMocks();
  files.length = 0;
});

it('captures the export view as a PNG written to the cache directory', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const encodeToBytes = jest.fn(() => bytes);
  capture.mockResolvedValue({ encodeToBytes });
  const ref = { current: {} };
  const uri = await captureToPng(ref as never);
  expect(capture).toHaveBeenCalledWith(ref);
  expect(encodeToBytes).toHaveBeenCalledWith(ImageFormat.PNG);
  expect(uri).toMatch(/^file:\/\/\/cache\/recap-\d+\.png$/);
  expect(files[0]!.create).toHaveBeenCalledWith({ overwrite: true });
  expect(files[0]!.write).toHaveBeenCalledWith(bytes);
});

it('fails when nothing was captured', async () => {
  capture.mockResolvedValue(null);
  await expect(captureToPng({ current: null } as never)).rejects.toThrow('capture_failed');
});

it('saves to Photos, asking for write access only the first time', async () => {
  perms.mockResolvedValue(permission(true));
  expect(await saveImage('file:///cache/a.png')).toBe('saved');
  expect(request).not.toHaveBeenCalled();
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/a.png');

  perms.mockResolvedValue(permission(false));
  request.mockResolvedValue(permission(true));
  expect(await saveImage('file:///cache/b.png')).toBe('saved');
  expect(perms).toHaveBeenLastCalledWith(true);
  expect(request).toHaveBeenCalledWith(true);
});

it('reports denied without asking again, or when the user declines', async () => {
  perms.mockResolvedValue(permission(false, false));
  expect(await saveImage('file:///cache/a.png')).toBe('denied');
  expect(request).not.toHaveBeenCalled();
  perms.mockResolvedValue(permission(false));
  request.mockResolvedValue(permission(false, false));
  expect(await saveImage('file:///cache/a.png')).toBe('denied');
  expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
});

it('shares the file through the system share sheet', async () => {
  await shareImage('file:///cache/a.png');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/a.png', { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your recap' });
});

// jest-setup mocks the media library, so the tests above can't tell a real save from the package
// root's legacy stub (which always throws on a device). Load the REAL module recapCapture imports,
// over a fake native module, and check its functions reach the native save and write-only permission.
it('imports a media library whose save and permission calls are real, not the throwing stubs', async () => {
  const source = readFileSync(join(__dirname, '../../src/lib/recapCapture.ts'), 'utf8');
  const imported = [...source.matchAll(/from '(expo-media-library[^']*)'/g)].map((m) => m[1]!);
  expect(imported).toEqual(['expo-media-library/legacy']);
  const native = {
    saveToLibraryAsync: jest.fn(() => Promise.resolve()),
    getPermissionsAsync: jest.fn(() => Promise.resolve(permission(true))),
    requestPermissionsAsync: jest.fn(() => Promise.resolve(permission(true))),
  };
  let real!: typeof MediaLibrary;
  jest.isolateModules(() => {
    jest.doMock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireNativeModule: () => native }));
    real = jest.requireActual(imported[0]!);
  });
  await real.saveToLibraryAsync('file:///cache/a.png');
  await real.getPermissionsAsync(true);
  await real.requestPermissionsAsync(true);
  expect(native.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/a.png');
  expect(native.getPermissionsAsync).toHaveBeenCalledWith(true);
  expect(native.requestPermissionsAsync).toHaveBeenCalledWith(true);
});
