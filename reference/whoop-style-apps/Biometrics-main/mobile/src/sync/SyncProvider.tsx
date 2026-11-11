import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { fetchSyncStatus, requestSync, type ConnectionState, type SyncState, type SyncStatusDTO } from '../api/sync';
import { ApiError } from '../api/client';
import { useToast } from '../components/ui/toast';

// Keeps the app's Google Health data fresh. Coming back to the foreground
// after more than 15 minutes (by the SERVER's last sync, so a wrong phone
// clock can't confuse it) asks the server to catch up, follows the job until
// it finishes, and bumps dataVersion so data screens reload.

export const STALE_AFTER_MS = 15 * 60 * 1000;
export const POLL_MS = 1500;
export const POLL_TIMEOUT_MS = 60 * 1000;

export type SyncSource = 'foreground' | 'manual' | 'pull';

export interface SyncContextValue {
  state: 'unknown' | SyncState;
  lastSyncedAt: string | null;
  connection: ConnectionState | null;
  /** Bumped after every successful sync; data screens reload when it changes. */
  dataVersion: number;
  syncNow: (source: SyncSource) => Promise<void>;
}

type SyncStatus = Pick<SyncContextValue, 'state' | 'lastSyncedAt' | 'connection'>;

const DEFAULT: SyncContextValue = { state: 'unknown', lastSyncedAt: null, connection: null, dataVersion: 0, syncNow: async () => undefined };
const SyncContext = createContext<SyncContextValue | null>(null);

/** Outside a SyncProvider (a screen rendered on its own, in tests) nothing syncs. */
export function useSync(): SyncContextValue {
  return useContext(SyncContext) ?? DEFAULT;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SyncProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus>({ state: 'unknown', lastSyncedAt: null, connection: null });
  const [dataVersion, setDataVersion] = useState(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const statusRef = useRef(status);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((next: SyncStatus) => {
    // Updated immediately, not on the next render: checkAndSync calls syncNow
    // straight after, and syncNow must compare against this lastSyncedAt.
    statusRef.current = next;
    if (mounted.current) setStatus(next);
  }, []);

  const apply = useCallback(
    (next: SyncStatusDTO) => update({ state: next.state, lastSyncedAt: next.lastSyncedAt, connection: next.connection }),
    [update],
  );

  const syncNow = useCallback(
    async (source: SyncSource) => {
      if (running.current) return;
      running.current = true;
      const before = statusRef.current.lastSyncedAt;
      update({ ...statusRef.current, state: 'syncing' });
      try {
        try {
          await requestSync();
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            update({ state: 'idle', lastSyncedAt: before, connection: 'NOT_CONNECTED' });
            return;
          }
          throw e;
        }
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let latest = await fetchSyncStatus();
        while (latest.state === 'syncing') {
          if (Date.now() >= deadline) throw new Error('Sync took too long');
          await wait(POLL_MS);
          latest = await fetchSyncStatus();
        }
        apply(latest);
        const advanced = latest.lastSyncedAt !== null && latest.lastSyncedAt !== before;
        if (latest.connection === 'DISCONNECTED') {
          toast.show('Google Health is disconnected', 'error');
        } else if (latest.state === 'failed') {
          toast.show("Couldn't sync with Google Health", 'error');
        } else if (advanced) {
          if (mounted.current) setDataVersion((v) => v + 1);
          toast.show('Synced with Google Health', 'success');
        } else if (source !== 'foreground') {
          toast.show('Already up to date', 'success');
        }
      } catch {
        update({ ...statusRef.current, state: 'failed' });
        toast.show("Couldn't sync with Google Health", 'error');
      } finally {
        running.current = false;
      }
    },
    [toast, update, apply],
  );

  const checkAndSync = useCallback(async () => {
    if (running.current) return;
    let current: SyncStatusDTO;
    try {
      current = await fetchSyncStatus();
    } catch {
      return; // A failed check is not worth an error toast; the next foreground tries again.
    }
    apply(current);
    if (current.connection !== 'CONNECTED') return;
    const stale = !current.lastSyncedAt || Date.now() - Date.parse(current.lastSyncedAt) > STALE_AFTER_MS;
    // A sync already running (e.g. the server's backstop) is followed to completion.
    if (stale || current.state === 'syncing') await syncNow('foreground');
  }, [apply, syncNow]);

  useEffect(() => {
    void checkAndSync();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkAndSync();
    });
    return () => sub.remove();
  }, [checkAndSync]);

  const value = useMemo(() => ({ ...status, dataVersion, syncNow }), [status, dataVersion, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
