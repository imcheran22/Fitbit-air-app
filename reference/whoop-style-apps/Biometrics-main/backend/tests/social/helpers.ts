/**
 * An IANA zone where it is `hour`:xx right now, for route tests that read the real clock. Etc/GMT zones have
 * inverted signs: Etc/GMT-3 is UTC+3. Pick a middle-of-the-window hour (22 for night, 12 for day), so a test that
 * crosses an hour boundary still lands in the same window.
 */
export function zoneAtLocalHour(hour: number, now: Date = new Date()): string {
  const ahead = (((hour - now.getUTCHours()) % 24) + 24) % 24; // hours ahead of UTC, 0..23
  if (ahead === 0) return 'UTC';
  return ahead <= 14 ? `Etc/GMT-${ahead}` : `Etc/GMT+${24 - ahead}`;
}
