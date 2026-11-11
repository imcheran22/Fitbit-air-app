import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchRecoveryMonth, fetchRecoveryPage, type RecoveryMonthDTO, type RecoveryPageDTO } from '../api/recovery';
import { useSync } from '../sync/SyncProvider';

export type MonthLoad = { status: 'loading' | 'error' | 'ready'; data?: RecoveryMonthDTO };

type Loaded = { key: string; page: RecoveryPageDTO };

// Loads the bundle for `date` (undefined = today). Today refetches on focus and after a sync,
// because scores land after the morning sync. Months are cached by YYYY-MM for calendar paging.
// As in useSection (components/sleep/Section.tsx): only the latest request lands, the loading
// state shows only while there is no page for this date, and a failed refresh keeps the page.
export function useRecoveryPage(date?: string) {
  const key = date ?? 'today';
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [errorKind, setErrorKind] = useState<'future' | 'other' | null>(null);
  const [months, setMonths] = useState<Record<string, MonthLoad>>({});
  const loadedRef = useRef<Loaded | null>(null);
  const monthsRef = useRef(months);
  const requestId = useRef(0);
  const inflight = useRef(new Set<string>());
  // The mount effect already loads, so the first focus (the mount itself) is skipped.
  const focusedOnce = useRef(false);
  const { dataVersion } = useSync();

  const putMonth = useCallback((m: string, v: MonthLoad) => {
    setMonths((s) => {
      const next = { ...s, [m]: v };
      monthsRef.current = next;
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const hasPage = () => loadedRef.current?.key === key;
    if (!hasPage()) setState('loading');
    try {
      const p = await fetchRecoveryPage(key);
      if (id !== requestId.current) return;
      loadedRef.current = { key, page: p };
      setLoaded(loadedRef.current);
      putMonth(p.month.month, { status: 'ready', data: p.month });
      setState('ready');
      setErrorKind(null);
    } catch (e) {
      if (id !== requestId.current || hasPage()) return;
      setErrorKind((e as { status?: number } | null)?.status === 400 ? 'future' : 'other');
      setState('error');
    }
  }, [key, putMonth]);

  useEffect(() => {
    void load();
    return () => { requestId.current++; };
  }, [load, dataVersion]);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    // Today either by omission or by the loaded page (Home passes today's date explicitly).
    if (date === undefined || loadedRef.current?.page.isToday) void load();
  }, [date, load]));

  const loadMonth = useCallback((m: string) => {
    if (monthsRef.current[m]?.status === 'ready' || inflight.current.has(m)) return;
    inflight.current.add(m);
    putMonth(m, { status: 'loading' });
    fetchRecoveryMonth(m)
      .then((r) => putMonth(m, { status: 'ready', data: r.month }))
      .catch(() => putMonth(m, { status: 'error' }))
      .finally(() => inflight.current.delete(m));
  }, [putMonth]);

  // Before the effect runs for a new date, never show the old date's page under it.
  const page = loaded?.key === key ? loaded.page : null;
  return {
    state: state === 'ready' && !page ? 'loading' : state,
    page, errorKind,
    reload: () => void load(),
    month: (m: string): MonthLoad => months[m] ?? { status: 'loading' },
    loadMonth,
  };
}
