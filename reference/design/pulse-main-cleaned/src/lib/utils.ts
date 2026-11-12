export { cn } from "cn"

/** `items` with the one at `i` swapped with its neighbour `by` (-1 up, +1 down); unchanged at either end. */
export function moved<T>(items: T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (j < 0 || j >= items.length) return items
  const next = [...items]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
