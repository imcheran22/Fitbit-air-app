import { monthCells } from '../../src/lib/calendarGrid';

describe('monthCells', () => {
  it('is Monday-first with leading blanks', () => {
    const c = monthCells('2026-10'); // 1 Oct 2026 is a Thursday
    expect(c.slice(0, 4)).toEqual([{ date: null }, { date: null }, { date: null }, { date: '2026-10-01' }]);
    expect(c.filter((x) => x.date).length).toBe(31);
  });
  it('a month starting on Monday has no blanks; February in a leap year has 29 days', () => {
    expect(monthCells('2026-06')[0]).toEqual({ date: '2026-06-01' });
    expect(monthCells('2028-02').filter((x) => x.date).length).toBe(29);
  });
  it('has no trailing padding', () => {
    const c = monthCells('2026-10');
    expect(c).toHaveLength(3 + 31);
    expect(c[c.length - 1]).toEqual({ date: '2026-10-31' });
  });
});
