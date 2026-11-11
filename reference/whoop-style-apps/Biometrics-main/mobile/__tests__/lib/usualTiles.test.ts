import { recoveryRecords, usualTiles } from '../../src/lib/usualTiles';
import type { MetricRecord } from '../../src/lib/metricInsights';
import type { DailyScoreDTO } from '../../src/api/scores';

const rec = (metricType: MetricRecord['metricType'], date: string, value: number): MetricRecord => ({ id: `${metricType}-${date}`, metricType, value, recordedAt: `${date}T00:00:00.000Z` });
const score = (date: string, value: number | null): DailyScoreDTO => ({ date, type: 'RECOVERY', score: value, confidenceLevel: 'HIGH', algorithmVersion: 'v1', factors: [], coldStart: [] });

it('maps Recovery scores with a value to tile records, oldest first', () => {
  expect(recoveryRecords([score('2026-10-06', 71), score('2026-10-05', null), score('2026-10-04', 64)])).toEqual([
    { id: 'RECOVERY-2026-10-04', metricType: 'RECOVERY', value: 64, recordedAt: '2026-10-04T00:00:00.000Z' },
    { id: 'RECOVERY-2026-10-06', metricType: 'RECOVERY', value: 71, recordedAt: '2026-10-06T00:00:00.000Z' },
  ]);
});

it('builds Resting HR, Sleep, HRV and Recovery tiles with a short delta, and leaves steps to the calendar', () => {
  const records = [
    rec('RESTING_HR', '2026-09-01', 60), rec('RESTING_HR', '2026-10-06', 58),
    rec('HRV', '2026-10-06', 61), rec('STEPS', '2026-10-06', 9000),
  ];
  const recovery = recoveryRecords([score('2026-10-06', 71)]);
  const tiles = usualTiles(records, recovery, '2026-10-07');
  expect(tiles.map((t) => t.type)).toEqual(['RESTING_HR', 'SLEEP', 'HRV', 'RECOVERY']);
  expect(tiles[0]).toMatchObject({ latest: expect.stringContaining('58'), delta: 'Down 3% vs the previous 30 days' });
  expect(tiles[1]).toMatchObject({ latest: null, latestDate: null, delta: null, series: [] });
  expect(tiles[2]).toMatchObject({ delta: 'No readings from the 30 days before' });
  expect(tiles[3]).toMatchObject({ label: 'Recovery', latest: '71', latestDate: '2026-10-06' });
  expect(tiles[0].label).toBe('Resting HR');
});

it('gives Recovery a real change against the 30 days before', () => {
  const recovery = recoveryRecords([score('2026-10-06', 66), score('2026-09-01', 60)]);
  const [, , , tile] = usualTiles([], recovery, '2026-10-07');
  expect(tile).toMatchObject({ latest: '66', delta: 'Up 10% vs the previous 30 days' });
});

it('draws only the 30-day window, so an old reading draws no line', () => {
  const records = [rec('HRV', '2026-08-01', 50), rec('HRV', '2026-08-02', 52), rec('HRV', '2026-10-05', 60), rec('HRV', '2026-10-06', 61)];
  const tiles = usualTiles(records, [], '2026-10-07');
  expect(tiles[2]!.points.map((p) => p.value)).toEqual([60, 61]);
  expect(tiles[2]!.series).toHaveLength(4);
  const stale = usualTiles([rec('HRV', '2026-08-01', 50), rec('HRV', '2026-08-02', 52)], [], '2026-10-07');
  expect(stale[2]).toMatchObject({ latest: null, points: [] });
});
