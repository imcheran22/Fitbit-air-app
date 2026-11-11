import { apiFetch } from './client';

export interface ActivityDTO {
  days: { date: string; steps: number }[];
  // The oldest STEPS record the server has, or null when none has synced yet.
  earliestDate: string | null;
}

// Daily steps for an inclusive civil-date range (the server caps it at 400 days).
export function fetchActivity(from: string, to: string): Promise<ActivityDTO> {
  return apiFetch<ActivityDTO>(`/me/activity?from=${from}&to=${to}`);
}
