const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Synced just now" / "12 min ago" / "3 h ago" / "yesterday" / "on Sep 21", in the device's local time. */
export function formatLastSynced(iso: string, now: Date, prefix = 'Synced'): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return `${prefix} just now`;
  if (minutes < 60) return `${prefix} ${minutes} min ago`;
  if (sameLocalDay(then, now)) return `${prefix} ${Math.floor(minutes / 60)} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(then, yesterday)) return `${prefix} yesterday`;
  return `${prefix} on ${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
