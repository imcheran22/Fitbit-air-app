const plain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * `next`, with every part that deep-equals the same part of `prev` swapped for prev's own object (react-query's
 * replaceEqualDeep). A reload that changed one tile hands back the other tiles' objects unchanged, so the compiled
 * components that show them see the same props and skip their render. Plain objects and arrays only; anything else
 * (a Date, a Map, a function) counts as changed.
 */
export function keepEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  const arrays = Array.isArray(prev) && Array.isArray(next);
  if (!arrays && !(plain(prev) && plain(next))) return next;
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const keys = Object.keys(n);
  let same = keys.length === Object.keys(p).length;
  const out: Record<string, unknown> = arrays ? ([] as unknown as Record<string, unknown>) : {};
  for (const k of keys) {
    out[k] = keepEqual(p[k], n[k]);
    if (out[k] !== p[k] || !(k in p)) same = false;
  }
  return (same ? prev : out) as T;
}
