import { formatLastSynced } from '../../src/sync/formatLastSynced';

// Local-time constructors keep the test independent of the machine's time zone.
const now = new Date(2026, 8, 24, 15, 0, 0);
const at = (...parts: [number, number, number, number]) => new Date(2026, ...parts).toISOString();

describe('formatLastSynced', () => {
  it.each([
    [new Date(2026, 8, 24, 14, 59, 30).toISOString(), 'Synced just now'],
    [at(8, 24, 14, 59), 'Synced 1 min ago'],
    [at(8, 24, 14, 48), 'Synced 12 min ago'],
    [at(8, 24, 12, 0), 'Synced 3 h ago'],
    [at(8, 23, 22, 0), 'Synced yesterday'],
    [at(8, 21, 9, 0), 'Synced on Sep 21'],
  ])('describes %s as %p', (iso, text) => {
    expect(formatLastSynced(iso, now)).toBe(text);
  });

  it('takes a prefix for Settings', () => {
    expect(formatLastSynced(at(8, 24, 14, 48), now, 'Last synced')).toBe('Last synced 12 min ago');
  });

  it('treats a time slightly in the future (clock skew) as just now', () => {
    expect(formatLastSynced(at(8, 24, 15, 1), now)).toBe('Synced just now');
  });
});
