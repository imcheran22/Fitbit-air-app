import { apiFetch } from './client';

export type SyncState = 'idle' | 'syncing' | 'failed';
export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED';

export interface SyncStatusDTO {
  state: SyncState;
  lastSyncedAt: string | null;
  connection: ConnectionState;
}

/** Asks the server to catch up with Google Health. A 409 (ApiError) means not connected. */
export function requestSync(): Promise<{ state: SyncState; lastSyncedAt: string | null }> {
  return apiFetch('/me/sync', { method: 'POST' });
}

export function fetchSyncStatus(): Promise<SyncStatusDTO> {
  return apiFetch<SyncStatusDTO>('/me/sync');
}
