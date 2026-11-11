import { useRef, useState } from 'react';
import type { View } from 'react-native';
import { captureToPng, saveImage, shareImage } from './recapCapture';

export const EXPORT_NOTICES = {
  saved: 'Saved to Photos.',
  denied: 'Photos access is off. Allow it in Settings to save images.',
  failed: "The image couldn't be made. Please try again.",
} as const;
export type ExportNotice = keyof typeof EXPORT_NOTICES;

/**
 * Save image / Share for a recap image (spec 2026-10-04 §3), shared by the builder and the story
 * viewer. `exportRef` goes on the OFF-SCREEN export view (exportLayout size), the only thing
 * captured; one capture runs at a time.
 */
export function useRecapExport() {
  const exportRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  // Two presses in one frame both see busy === false; the ref lets only the first through.
  const inFlight = useRef(false);

  async function run(after: (uri: string) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      let uri: string;
      try {
        uri = await captureToPng(exportRef);
      } catch {
        setNotice('failed');
        return;
      }
      await after(uri);
    } catch {
      setNotice('failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const save = () => run(async (uri) => setNotice((await saveImage(uri)) === 'saved' ? 'saved' : 'denied'));
  const share = () => run((uri) => shareImage(uri));
  return { exportRef, busy, notice, save, share };
}
