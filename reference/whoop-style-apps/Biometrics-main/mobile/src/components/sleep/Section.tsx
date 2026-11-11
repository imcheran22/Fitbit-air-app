import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Text } from '../ui/text';

// Each section loads and fails on its own (spec 2026-10-03 §3).
export type Section<T> = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: T };

// Runs `load` on mount and whenever `key` or `deps` change; only the latest
// run lands. `key` names WHAT is loaded (e.g. the range): a new key shows the
// loading state and, on failure, the error with its retry. `deps` only
// refresh the same thing (a sync), so a failed refresh keeps what is on screen.
// An error is what is on screen too: a retry, refocus or sync refreshes it
// quietly and leaves the error up until a refresh succeeds.
export function useSection<T>(key: string, load: () => Promise<T>, deps: unknown[]): [Section<T>, () => void] {
  const [state, setState] = useState<Section<T> & { key?: string }>({ phase: 'loading' });
  const requestId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, [key, ...deps]);
  const reload = useCallback(() => {
    const id = ++requestId.current;
    const keep = (prev: Section<T> & { key?: string }) => prev.key === key && (prev.phase === 'ready' || prev.phase === 'error');
    setState((prev) => (keep(prev) ? prev : { phase: 'loading' }));
    run().then(
      (data) => {
        if (id === requestId.current) setState({ phase: 'ready', data, key });
      },
      () => {
        if (id === requestId.current) setState((prev) => (keep(prev) ? prev : { phase: 'error', key }));
      },
    );
  }, [run, key]);
  useEffect(() => {
    reload();
    return () => {
      requestId.current++;
    };
  }, [reload]);
  // Before the effect runs for a new key, never show the old key's data under it.
  const shown: Section<T> = state.phase === 'ready' && state.key !== key ? { phase: 'loading' } : state;
  return [shown, reload];
}

export function SectionError({ testID, message, onRetry }: { testID: string; message: string; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 py-6">
      <Text className="text-center text-caption text-muted-foreground">{message}</Text>
      <Button testID={testID} variant="secondary" size="sm" onPress={onRetry}>
        Try again
      </Button>
    </Card>
  );
}
