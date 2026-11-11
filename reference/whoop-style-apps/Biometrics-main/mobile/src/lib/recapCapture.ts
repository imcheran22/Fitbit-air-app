import type { RefObject } from 'react';
import type { View } from 'react-native';
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
// The package root's saveToLibraryAsync is a stub that always throws (expo-media-library 57); the
// legacy entry is the real add-only save with write-only permissions (iOS addOnly, Android no READ).
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';

// Recap image export (spec 2026-10-04 §3). The ref is the OFF-SCREEN export view, laid out at
// exportLayout(...) so the capture is 1080 px wide on any device; never the on-screen preview.
// Nothing leaves the phone until the user taps Save or Share.

export async function captureToPng(ref: RefObject<View | null>): Promise<string> {
  // makeImageFromView's generic does not name React Native's host View type; the ref is a mounted native view.
  const image = await makeImageFromView(ref as never);
  if (!image) throw new Error('capture_failed');
  const file = new File(Paths.cache, `recap-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(image.encodeToBytes(ImageFormat.PNG));
  return file.uri;
}

export type SaveResult = 'saved' | 'denied';

/** Write-only Photos access: asked the first time, never again once the user said no for good. */
export async function saveImage(uri: string): Promise<SaveResult> {
  let permission = await MediaLibrary.getPermissionsAsync(true);
  if (!permission.granted) {
    if (!permission.canAskAgain) return 'denied';
    permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return 'denied';
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return 'saved';
}

export async function shareImage(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your recap' });
}
