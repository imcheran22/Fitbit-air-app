// Reads ahead of an in-order consumer: the sync's Health Connect reads run a few at a time while the mapping takes
// their results one by one, in the order it always did, so the results don't change.

/**
 * `take(i)` gives `run(i)`'s promise, for i = 0, 1, 2… in order, having started `run` for up to `limit` indices from i on
 * (never past n). The ones before i were taken and awaited, so at most `limit` run at once.
 */
export function readAhead<T>(n: number, limit: number, run: (i: number) => Promise<T>) {
  const started = new Map<number, Promise<T>>();
  let next = 0;
  return (i: number): Promise<T> => {
    while (next < n && next < i + limit) {
      const p = run(next);
      // take() hands it on to be awaited; this only keeps a rejection before then from reading as unhandled.
      p.catch(() => {});
      started.set(next++, p);
    }
    const p = started.get(i);
    if (!p) throw new Error(`readAhead: ${i} taken twice or out of range`);
    started.delete(i);
    return p;
  };
}
