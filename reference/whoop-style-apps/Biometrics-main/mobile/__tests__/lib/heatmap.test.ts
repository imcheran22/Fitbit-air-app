import {
  addDays,
  cellAt,
  compareToAverage,
  dayOfWeek,
  daysBetween,
  fetchRange,
  formatDayTitle,
  gridGeometry,
  heatLevel,
  historyNote,
  monthGrid,
  monthLabels,
  monthTitle,
  rangeStats,
  shiftMonth,
  todayCivil,
  viewRange,
  weekColumnsGrid,
  yearStart,
} from '../../src/lib/heatmap';

const GOAL = 10000;
const none = new Map<string, number>();

describe('date helpers', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days and weekdays (Sunday = 0)', () => {
    expect(daysBetween('2026-09-01', '2026-09-22')).toBe(21);
    expect(dayOfWeek('2026-09-01')).toBe(2); // a Tuesday
    expect(dayOfWeek('2026-02-01')).toBe(0); // a Sunday
  });

  it("uses the device's own calendar date for today", () => {
    expect(todayCivil(new Date(2026, 8, 22, 23, 59))).toBe('2026-09-22');
    expect(todayCivil(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('shifts months from any day and titles them', () => {
    expect(shiftMonth('2026-09-22', -1)).toBe('2026-08-01');
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-12-05', 1)).toBe('2027-01-01');
    expect(monthTitle('2026-09-01')).toBe('September 2026');
  });

  it('formats a day title', () => {
    expect(formatDayTitle('2026-09-22')).toBe('Tue, Sep 22, 2026');
  });
});

describe('heatLevel', () => {
  it('marks a day with no record as null, distinct from a recorded 0', () => {
    expect(heatLevel(undefined, GOAL)).toBeNull();
    expect(heatLevel(null, GOAL)).toBeNull();
    expect(heatLevel(0, GOAL)).toBe(0);
  });

  it('buckets by fixed fractions of the goal', () => {
    expect(heatLevel(1, GOAL)).toBe(1);
    expect(heatLevel(2499, GOAL)).toBe(1);
    expect(heatLevel(2500, GOAL)).toBe(2);
    expect(heatLevel(4999, GOAL)).toBe(2);
    expect(heatLevel(5000, GOAL)).toBe(3);
    expect(heatLevel(9999, GOAL)).toBe(3);
    expect(heatLevel(10000, GOAL)).toBe(4);
    expect(heatLevel(25000, GOAL)).toBe(4);
  });
});

describe('monthGrid', () => {
  it('lays a month out Sunday-first with leading blanks', () => {
    const grid = monthGrid('2026-09-15', '2026-12-31', none, GOAL);

    expect(grid.cols).toBe(7);
    expect(grid.rows).toBe(5); // 2 leading blanks + 30 days
    expect(grid.cells).toHaveLength(30);
    expect(grid.cells[0]).toMatchObject({ date: '2026-09-01', col: 2, row: 0, value: null, level: null });
    expect(grid.cells[29]).toMatchObject({ date: '2026-09-30', col: 3, row: 4 });
  });

  it('fits a 28-day February starting on a Sunday into four rows', () => {
    const grid = monthGrid('2026-02-10', '2026-12-31', none, GOAL);
    expect(grid.rows).toBe(4);
    expect(grid.cells[0]).toMatchObject({ date: '2026-02-01', col: 0, row: 0 });
  });

  it('leaves out days after today but keeps the full month shape', () => {
    const grid = monthGrid('2026-09-01', '2026-09-22', new Map([['2026-09-22', 12000]]), GOAL);
    expect(grid.cells).toHaveLength(22);
    expect(grid.rows).toBe(5);
    expect(grid.cells[21]).toMatchObject({ date: '2026-09-22', value: 12000, level: 4 });
  });
});

describe('weekColumnsGrid', () => {
  it('puts each week in a column starting on the Sunday on or before the start', () => {
    const grid = weekColumnsGrid('2026-01-01', '2026-01-14', none, GOAL);

    expect(grid.rows).toBe(7);
    expect(grid.cols).toBe(3);
    expect(grid.cells).toHaveLength(14);
    expect(grid.cells[0]).toMatchObject({ date: '2026-01-01', col: 0, row: 4 }); // a Thursday
    expect(grid.cells.find((c) => c.date === '2026-01-04')).toMatchObject({ col: 1, row: 0 });
    expect(grid.cells[13]).toMatchObject({ date: '2026-01-14', col: 2, row: 3 });
  });

  it('spans at most 53 week columns for a trailing year', () => {
    const today = '2026-09-22';
    const grid = weekColumnsGrid(yearStart(today), today, none, GOAL);
    expect(grid.cells).toHaveLength(365);
    expect(grid.cols).toBeLessThanOrEqual(53);
  });
});

describe('monthLabels', () => {
  it('labels each month once, dropping a leading sliver that would collide', () => {
    const today = '2026-09-22';
    const labels = monthLabels(weekColumnsGrid(yearStart(today), today, none, GOAL));

    expect(labels.map((l) => l.label)).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(labels[0].col).toBe(1);
    for (let i = 1; i < labels.length; i++) expect(labels[i].col - labels[i - 1].col).toBeGreaterThanOrEqual(3);
  });

  it('keeps the first label when the range starts at a month boundary', () => {
    const labels = monthLabels(weekColumnsGrid('2026-01-01', '2026-03-10', none, GOAL));
    expect(labels.map((l) => l.label)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(labels[0].col).toBe(0);
  });
});

describe('ranges', () => {
  it('gives each view its inclusive range', () => {
    const today = '2026-09-22';
    expect(viewRange('ytd', today, today)).toEqual({ start: '2026-01-01', end: today });
    expect(viewRange('year', today, today)).toEqual({ start: '2025-09-23', end: today });
    expect(viewRange('month', today, '2026-09-01')).toEqual({ start: '2026-09-01', end: today });
    expect(viewRange('month', today, '2026-02-01')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('fetches from the first of the month a year ago, always inside the 400-day server cap', () => {
    expect(fetchRange('2026-09-22')).toEqual({ from: '2025-09-01', to: '2026-09-22' });
    for (let date = '2027-01-01'; date <= '2028-12-31'; date = addDays(date, 1)) {
      const { from, to } = fetchRange(date);
      expect(daysBetween(from, to) + 1).toBeLessThanOrEqual(400);
      expect(from <= yearStart(date)).toBe(true);
    }
  });
});

describe('rangeStats', () => {
  const steps = new Map([
    ['2026-09-01', 3000],
    ['2026-09-02', 0],
    // 09-03 has no record
    ['2026-09-04', 11000],
    ['2026-09-05', 10000],
    ['2026-09-06', 12500],
    ['2026-09-07', 4000],
  ]);

  it('totals and averages over days with a record only', () => {
    const stats = rangeStats(steps, '2026-09-01', '2026-09-07', '2026-09-07', GOAL);

    expect(stats.total).toBe(40500);
    expect(stats.daysWithData).toBe(6);
    expect(stats.average).toBe(6750);
    expect(stats.activeDays).toBe(5);
    expect(stats.goalDays).toBe(3);
    expect(stats.best).toEqual({ date: '2026-09-06', steps: 12500 });
  });

  it('counts the goal streak up to yesterday while today is still short of the goal', () => {
    expect(rangeStats(steps, '2026-09-01', '2026-09-07', '2026-09-07', GOAL).streak).toBe(3);
  });

  it('includes today in the streak once today reaches the goal', () => {
    const withToday = new Map(steps).set('2026-09-07', 10000);
    expect(rangeStats(withToday, '2026-09-01', '2026-09-07', '2026-09-07', GOAL).streak).toBe(4);
  });

  it("ends a past range's streak at its last day", () => {
    expect(rangeStats(steps, '2026-09-01', '2026-09-05', '2026-09-30', GOAL).streak).toBe(2);
  });

  it('reports no average or best day for a range without records', () => {
    const stats = rangeStats(none, '2026-09-01', '2026-09-07', '2026-09-07', GOAL);
    expect(stats.average).toBeNull();
    expect(stats.best).toBeNull();
    expect(stats.streak).toBe(0);
  });
});

describe('compareToAverage', () => {
  it('describes a day against the range average', () => {
    expect(compareToAverage(12000, 10000)).toBe('20% above your average for this range.');
    expect(compareToAverage(5000, 10000)).toBe('50% below your average for this range.');
    expect(compareToAverage(10100, 10000)).toBe('In line with your average for this range.');
    expect(compareToAverage(5000, null)).toBeNull();
  });
});

describe('historyNote', () => {
  it('says so while no history has synced', () => {
    expect(historyNote(null, '2026-01-01', '2026-09-22')).toBe('Your step history is still syncing.');
  });

  it('says how much history exists when it starts inside the range', () => {
    expect(historyNote('2026-09-01', '2025-09-23', '2026-09-22')).toBe(
      'Only 22 days of history so far. Earlier days fill in as it syncs.',
    );
  });

  it('is silent when history covers the range', () => {
    expect(historyNote('2025-01-01', '2026-09-01', '2026-09-22')).toBeNull();
  });
});

describe('geometry', () => {
  const grid = monthGrid('2026-09-01', '2026-09-30', none, 10000);

  it('fits bins to the width within bounds', () => {
    expect(gridGeometry(grid, 350, { minBin: 28, maxBin: 52, gap: 6 })).toEqual({ bin: 50, gap: 6, width: 350, height: 250 });
    expect(gridGeometry(grid, 1000, { minBin: 28, maxBin: 52, gap: 6 }).bin).toBe(52);
    expect(gridGeometry(grid, 70, { minBin: 28, maxBin: 52, gap: 6 }).bin).toBe(28);
  });

  it('hit-tests a point to the cell in that bin', () => {
    expect(cellAt(grid, 50, 125, 175)?.date).toBe('2026-09-22');
    expect(cellAt(grid, 50, 10, 10)).toBeNull(); // a leading blank
    expect(cellAt(grid, 50, -1, 10)).toBeNull();
  });
});
