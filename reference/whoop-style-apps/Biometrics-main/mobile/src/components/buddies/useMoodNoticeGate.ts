import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmMoodNotice } from '../../api/buddies';
import type { MoodNoticeSheetProps } from './MoodNoticeSheet';

/**
 * The one-time mood notice before the first pairing action (spec §4): `run(action)` runs it at once
 * once the notice was confirmed, else holds it behind the sheet until the user confirms.
 */
export function useMoodNoticeGate(initiallySeen: boolean): { run: (action: () => void) => void; sheet: MoodNoticeSheetProps } {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [failed, setFailed] = useState(false);
  // Refs, so a memoised `run` sees the confirm, closing the sheet (or leaving the screen) mid-confirm
  // drops the held action, and a double tap confirms once.
  const seen = useRef(initiallySeen);
  const pendingRef = useRef<null | (() => void)>(null);
  const confirming = useRef(false);

  const hold = useCallback((action: null | (() => void)) => {
    pendingRef.current = action;
    setPending(() => action);
  }, []);

  useEffect(
    () => () => {
      pendingRef.current = null;
    },
    [],
  );

  const run = useCallback(
    (action: () => void) => {
      if (seen.current) {
        action();
        return;
      }
      setFailed(false);
      hold(action);
    },
    [hold],
  );

  const confirm = useCallback(async () => {
    if (confirming.current) return;
    confirming.current = true;
    setFailed(false);
    try {
      await confirmMoodNotice();
    } catch {
      setFailed(true);
      return;
    } finally {
      confirming.current = false;
    }
    seen.current = true;
    const action = pendingRef.current;
    hold(null);
    action?.();
  }, [hold]);

  return { run, sheet: { visible: pending !== null, failed, onConfirm: () => void confirm(), onClose: () => hold(null) } };
}
