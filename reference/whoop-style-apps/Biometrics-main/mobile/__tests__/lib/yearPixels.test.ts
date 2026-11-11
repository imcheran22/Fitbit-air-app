import { pixelLevel, YEAR_COLUMNS, yearPixels } from '../../src/lib/yearPixels';

it('draws one cell per night of the calendar year in date order, Feb 29 included in a leap year (Review Focus 4)', () => {
  const leap = yearPixels(2028, [], 480, '2028-12-31');
  expect(leap.cells).toHaveLength(366);
  expect(leap.cells[59]!.date).toBe('2028-02-29');
  expect(leap.cells[0]!.date).toBe('2028-01-01');
  expect(leap.cells[365]!.date).toBe('2028-12-31');
  expect(yearPixels(2026, [], 480, '2026-12-31').cells).toHaveLength(365);
  expect(YEAR_COLUMNS).toBe(26);
});

it("keeps each night's minutes and steps it against the current goal; counts only past nights on goal", () => {
  const y = yearPixels(
    2026,
    [
      { date: '2026-01-02', minutesAsleep: 500 },
      { date: '2026-03-03', minutesAsleep: 480 },
      { date: '2026-04-04', minutesAsleep: 400 },
      { date: '2026-04-05', minutesAsleep: 300 },
      { date: '2026-11-01', minutesAsleep: 520 }, // after today: never counted
      { date: '2026-05-05', minutesAsleep: 0 },
    ],
    480,
    '2026-10-05',
  );
  const cell = (d: string) => y.cells.find((c) => c.date === d)!;
  expect(['2026-01-02', '2026-03-03', '2026-04-04', '2026-04-05', '2026-05-05', '2026-11-01', '2026-10-05'].map((d) => cell(d).level)).toEqual([
    'goal', 'goal', 'near', 'short', 'none', 'future', 'none',
  ]);
  expect(cell('2026-04-04').minutes).toBe(400);
  expect(cell('2026-05-05').minutes).toBeNull();
  expect(cell('2026-11-01').minutes).toBeNull();
  expect(y.onGoal).toBe(2);
});

it('buckets a night: on goal ≥ 100 %, near 75–<100 %, short < 75 %, no data without minutes', () => {
  expect(pixelLevel(480, 480)).toBe('goal');
  expect(pixelLevel(479, 480)).toBe('near');
  expect(pixelLevel(360, 480)).toBe('near');
  expect(pixelLevel(359, 480)).toBe('short');
  expect(pixelLevel(null, 480)).toBe('none');
});
