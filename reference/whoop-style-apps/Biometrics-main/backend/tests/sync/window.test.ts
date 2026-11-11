import { isEmptyWindow } from '../../src/sync/window';

// Windows are half-open [start, end) in YYYY-MM-DD form, so a window contains
// no days unless its start is strictly before its end.
describe('isEmptyWindow', () => {
  it('treats an equal start and end as empty', () => {
    expect(isEmptyWindow('2026-09-21', '2026-09-21')).toBe(true);
  });

  it('treats a start after the end as empty', () => {
    expect(isEmptyWindow('2026-09-22', '2026-09-21')).toBe(true);
  });

  it('treats a start before the end as non-empty, even by a single day', () => {
    expect(isEmptyWindow('2026-09-20', '2026-09-21')).toBe(false);
    expect(isEmptyWindow('2026-08-22', '2026-09-21')).toBe(false);
  });

  it('compares across month and year boundaries', () => {
    expect(isEmptyWindow('2026-08-31', '2026-09-01')).toBe(false);
    expect(isEmptyWindow('2025-12-31', '2026-01-01')).toBe(false);
    expect(isEmptyWindow('2026-01-01', '2025-12-31')).toBe(true);
  });
});
