// The Sleep page's state (spec 2026-10-09 one-sleep-page §3.0, §4.5). Page-scoped sections load once per anchor
// through useSection; the night (score + night) is keyed by D, cached for the page's life and cleared by a sync. As on
// the Recovery page: loading only before the first data, a failed refresh keeps what is shown, only the latest night
// request lands, the mount focus fetches nothing extra, and a refocus refreshes while the week contains today.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchScoreDetail, type ScoreBandsDTO, type ScoreDetailDTO } from '../api/scores';
import {
  fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity,
  type SleepActivityDTO, type SleepGoal, type SleepNight, type SleepNightDetail, type SleepRegularity,
} from '../api/sleep';
import { useSection, type Section } from '../components/sleep/Section';
import { useSync } from '../sync/SyncProvider';
import { addDays, monthStart, shiftMonth, todayCivil } from './heatmap';
import { isNapOnly } from './sleepStats';
import { readWindDown, type WindDownSettings } from './windDown';

export const REGULARITY_DAYS = 7;

export type NightBundle = { score: ScoreDetailDTO | null; night: SleepNightDetail | null };
export type NightLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: NightBundle };
export type MonthLoad = { status: 'loading' | 'error' | 'ready'; nights?: SleepNight[] };

export interface SleepPage {
  today: string;
  date: string | null;
  anchor: string;
  window: Section<SleepActivityDTO>;
  reloadWindow: () => void;
  regularity: Section<SleepRegularity>;
  reloadRegularity: () => void;
  goal: Section<SleepGoal>;
  reloadGoal: () => void;
  reminder: WindDownSettings | null;
  night: NightLoad;
  reloadNight: () => void;
  bands: ScoreBandsDTO | undefined;
  month: (month: string) => MonthLoad;
  loadMonth: (month: string) => void;
  retryMonth: (month: string) => void;
}

const monthEnd = (date: string) => addDays(shiftMonth(date, 1), -1);
const minDate = (a: string, b: string) => (a < b ? a : b);

export function resolveNight(param: string | undefined, today: string, nights: readonly SleepNight[] | null): string | null {
  if (param !== undefined) return param > today ? today : param;
  if (nights === null) return null;
  const from = addDays(today, -6);
  const recent = nights.filter((n) => n.date >= from && n.date <= today && !isNapOnly(n)).map((n) => n.date).sort();
  return recent[recent.length - 1] ?? today;
}

export function anchorFor(date: string, today: string): string {
  return date >= addDays(today, -6) ? today : date;
}

/**
 * Plan ruling 6: keyed by the anchor's month only, so a tap inside the week never refetches it. Starting 13 days
 * before the month (always on or before A − 13) keeps the key the same for every anchor in one month, so a tap to
 * another old night in that month never refetches either (final review I-3).
 */
export function windowRange(anchor: string, today: string): { from: string; to: string } {
  return { from: addDays(monthStart(anchor), -13), to: minDate(today, monthEnd(anchor)) };
}

export function monthSpan(month: string, today: string): { from: string; to: string } {
  const first = `${month}-01`;
  return { from: first, to: minDate(today, monthEnd(first)) };
}

const covers = (outer: { from: string; to: string }, inner: { from: string; to: string }) => inner.from >= outer.from && inner.to <= outer.to;

function notFoundIsNull(e: unknown): null {
  if ((e as { status?: number } | null)?.status === 404) return null;
  throw e;
}

export function useSleepPage(param?: string): SleepPage {
  const { dataVersion } = useSync();
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? todayCivil();
  const anchor = anchorFor(param === undefined ? today : resolveNight(param, today, null)!, today);
  const range = windowRange(anchor, today);

  const [fresh, reloadWindow] = useSection<SleepActivityDTO>(`${range.from}..${range.to}`, () => fetchSleep(range.from, range.to), [dataVersion]);
  // Ruling F16 (and Task 3 I-2): after the first data, a new window key on the same page (the server's today moving the
  // week) refetches quietly, with or without a date param; the last nights stay on screen until the new ones land, and
  // a failed refetch keeps them. A new param is a different page, so it shows loading, unless that anchor is already
  // inside the previous window. A picker, chart or month tap into the previous month changes the fetch key, and this
  // window starts 13 days before its month, so it already holds that anchor. Keep those nights up while the new
  // window loads. (A−13..A of a previous-month anchor starts the day before this fetch, so a full-span cover never
  // matches the tap that blanks the page.)
  const lastWindow = useRef<{ param: string | undefined; range: { from: string; to: string }; data: SleepActivityDTO } | null>(null);
  if (fresh.phase === 'ready') lastWindow.current = { param, range, data: fresh.data };
  const last = lastWindow.current;
  const inLastWindow = last !== null && anchor >= last.range.from && anchor <= last.range.to;
  const stale = fresh.phase !== 'ready' && last !== null && (last.param === param || (fresh.phase === 'loading' && inLastWindow))
    ? last
    : null;
  const win: Section<SleepActivityDTO> = stale ? { phase: 'ready', data: stale.data } : fresh;
  const [regularity, reloadRegularity] = useSection<SleepRegularity>('regularity', () => fetchSleepRegularity(REGULARITY_DAYS), [dataVersion]);
  const [goal, reloadGoal] = useSection<SleepGoal>('goal', () => fetchSleepGoal(), [dataVersion]);
  // The wind-down reminder lives on the device; read alongside the goal.
  const [reminder, setReminder] = useState<WindDownSettings | null>(null);
  const loadReminder = useCallback(() => {
    readWindDown().then(setReminder, () => undefined);
  }, []);
  useEffect(loadReminder, [loadReminder]);

  // The server's today (the user's own timezone) replaces the device guess once known.
  const reportedToday = win.phase === 'ready' ? win.data.today ?? null : null;
  useEffect(() => {
    if (reportedToday && reportedToday !== serverToday) setServerToday(reportedToday);
  }, [reportedToday, serverToday]);

  const date =
    param !== undefined ? resolveNight(param, today, null)
    : win.phase === 'ready' ? resolveNight(undefined, today, win.data.nights)
    : win.phase === 'error' ? today
    : null;

  // Night-scoped: score + night for D, cached by date; only the latest request lands.
  const cache = useRef(new Map<string, NightBundle>());
  const [shown, setShown] = useState<{ date: string; load: NightLoad } | null>(null);
  const nightRequest = useRef(0);
  const fetchNight = useCallback((d: string, force: boolean) => {
    const id = ++nightRequest.current;
    const cached = cache.current.get(d);
    if (cached) {
      setShown({ date: d, load: { status: 'ready', data: cached } });
      if (!force) return;
    } else {
      setShown({ date: d, load: { status: 'loading' } });
    }
    Promise.all([fetchScoreDetail(d, 'SLEEP'), fetchSleepNight(d).catch(notFoundIsNull)]).then(
      ([score, night]) => {
        if (id !== nightRequest.current) return;
        const data = { score, night };
        cache.current.set(d, data);
        setShown({ date: d, load: { status: 'ready', data } });
      },
      () => {
        // A failed refresh keeps the night already on screen.
        if (id !== nightRequest.current || cache.current.has(d)) return;
        setShown({ date: d, load: { status: 'error' } });
      },
    );
  }, []);
  useEffect(() => {
    if (date === null) return;
    fetchNight(date, false);
    return () => { nightRequest.current++; };
  }, [date, fetchNight]);

  // The latest render's values, for the stable callbacks below (the focus handler, months, retries).
  const latest = useRef({ date, anchor, today, range, reloadWindow, reloadRegularity, reloadGoal, loadReminder, fetchNight });
  latest.current = { date, anchor, today, range, reloadWindow, reloadRegularity, reloadGoal, loadReminder, fetchNight };

  // Months the window does not cover, cached by YYYY-MM for paging. Each month keeps its latest request id: only that
  // request lands, so an answer started before a sync never lands as fresh.
  const [months, setMonths] = useState<Record<string, MonthLoad>>({});
  const monthsRef = useRef(months);
  const monthRequest = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());
  const putMonth = useCallback((m: string, v: MonthLoad) => {
    setMonths((s) => {
      const next = { ...s, [m]: v };
      monthsRef.current = next;
      return next;
    });
  }, []);

  // Fetches a month. Quiet (a sync): the month's data stays while it loads, and a failure keeps it.
  const fetchMonth = useCallback((m: string, quiet: boolean) => {
    const id = (monthRequest.current.get(m) ?? 0) + 1;
    monthRequest.current.set(m, id);
    inflight.current.add(m);
    if (!quiet) putMonth(m, { status: 'loading' });
    const span = monthSpan(m, latest.current.today);
    const current = () => monthRequest.current.get(m) === id;
    fetchSleep(span.from, span.to).then(
      (res) => { if (current()) putMonth(m, { status: 'ready', nights: res.nights }); },
      () => { if (current() && !(quiet && monthsRef.current[m]?.status === 'ready')) putMonth(m, { status: 'error' }); },
    ).finally(() => { if (current()) inflight.current.delete(m); });
  }, [putMonth]);

  // A sync clears the night cache and refreshes the shown night and every loaded or requested month quietly (the
  // sections refresh through their deps).
  const seenVersion = useRef(dataVersion);
  useEffect(() => {
    if (seenVersion.current === dataVersion) return;
    seenVersion.current = dataVersion;
    const keep = date === null ? undefined : cache.current.get(date);
    cache.current.clear();
    for (const m of Object.keys(monthsRef.current)) fetchMonth(m, true);
    if (date !== null) {
      if (keep) cache.current.set(date, keep);
      fetchNight(date, true);
    }
  }, [dataVersion, date, fetchNight, fetchMonth]);

  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    // The mount already loads everything: the first focus is the mount itself.
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    const l = latest.current;
    // Back from BedtimeGoal (or anywhere): the goal and the reminder may have changed.
    l.reloadGoal();
    l.loadReminder();
    // The week contains today (even via an explicit date param): last night may have landed while away.
    if (l.anchor === l.today) {
      l.reloadWindow();
      l.reloadRegularity();
      if (l.date !== null) l.fetchNight(l.date, true);
    }
  }, []));

  const loadMonth = useCallback((m: string) => {
    const { today: t, range: r } = latest.current;
    if (covers(r, monthSpan(m, t)) || monthsRef.current[m]?.status === 'ready' || inflight.current.has(m)) return;
    fetchMonth(m, false);
  }, [fetchMonth]);

  const month = (m: string): MonthLoad => {
    const span = monthSpan(m, today);
    if (covers(range, span)) {
      const pick = (data: SleepActivityDTO): MonthLoad => ({ status: 'ready', nights: data.nights.filter((n) => n.date >= span.from && n.date <= span.to) });
      if (fresh.phase === 'ready') return pick(fresh.data);
      // During a quiet refetch the shown nights were fetched for the previous range: serve the month only if that range
      // covered it, never as ready-and-empty; once that refetch fails, an uncovered month is an error so it can retry.
      if (stale) return covers(stale.range, span) ? pick(stale.data) : months[m] ?? { status: fresh.phase === 'error' ? 'error' : 'loading' };
      return { status: fresh.phase === 'error' ? 'error' : 'loading' };
    }
    return months[m] ?? { status: 'loading' };
  };

  // Stable identities, so a consumer can put them in effect deps.
  const reloadNight = useCallback(() => {
    const { date: d, fetchNight: f } = latest.current;
    if (d !== null) f(d, true);
  }, []);
  const retryMonth = useCallback((m: string) => {
    const { today: t, range: r, reloadWindow: rw } = latest.current;
    if (covers(r, monthSpan(m, t))) rw(); else loadMonth(m);
  }, [loadMonth]);

  const night: NightLoad = date !== null && shown?.date === date ? shown.load : { status: 'loading' };
  const bands = (night.status === 'ready' ? night.data.score?.bands : undefined) ?? (win.phase === 'ready' ? win.data.bands : undefined);

  return {
    today, date, anchor,
    window: win, reloadWindow,
    regularity, reloadRegularity,
    goal, reloadGoal,
    reminder,
    night,
    reloadNight,
    bands,
    month, loadMonth,
    retryMonth,
  };
}
