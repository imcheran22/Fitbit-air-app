import { createContext, useContext, type ReactNode } from "react";

/** One day of the calendar panel's colouring: the day's three scores. */
export type CalendarDay = { day: string; recovery: number | null; strain: number | null; sleep: number | null };

/**
 * What the shells need to know about "now" (the web's ShellStatus, reduced to the calendar: sync and connection state
 * come with the Google and sync streams). `today` and `firstDay` are YYYY-MM-DD in the user's zone; `firstDay` is the
 * first day with data (days before it are not selectable). `loadMonth` fetches a month of scores for the calendar panel;
 * without it the days are simply uncoloured.
 */
export type ShellCalendar = {
  today: string;
  firstDay?: string | null;
  timeZone?: string;
  loadMonth?: (month: string) => Promise<CalendarDay[]>;
};

const Context = createContext<ShellCalendar | null>(null);

export function ShellCalendarProvider({ value, children }: { value: ShellCalendar; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShellCalendar(): ShellCalendar {
  const v = useContext(Context);
  if (!v) throw new Error("useShellCalendar needs a <ShellCalendarProvider> above it");
  return v;
}

/** For charts and rows that format clock times: the zone when there is a provider, the device's otherwise. */
export const useOptionalShellCalendar = () => useContext(Context);

/**
 * Sync freshness and the wear streak (the rest of the web's ShellStatus): what the header's SyncStatus and streak pill
 * show. Optional: without a provider (the kit, onboarding) they show nothing.
 */
export type ShellSync = {
  sync: { state: "ok" | "syncing" | "stale" | "error"; lastSuccessAt: number | null };
  connection: string;
  streak: { days: number; asOf: string } | null;
  timeZone?: string;
  /** The first import's days so far, while it runs (connection "importing"): Home's "Syncing" line. */
  importProgress?: { done: number; total: number };
  /** The database holds onboarding's sample data: the tab roots show the Sample data card (docs/onboarding.md). */
  sample?: boolean;
  /** Sync now: what pulling a page down runs (the web's AppLifecycle pull to sync). */
  syncNow?: () => Promise<unknown>;
};

const SyncContext = createContext<ShellSync | null>(null);
export const ShellSyncProvider = SyncContext.Provider;
export const useShellSync = () => useContext(SyncContext);
