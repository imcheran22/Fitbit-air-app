import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MOCKUP_CLOCK, MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { nightClock } from '../../src/lib/sleepStats';

const UTC = nightClock({ bedtime: '00:00', startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 }, []);
import { SleepCyclesCard, tailLine } from '../../src/components/sleep/SleepCyclesCard';

describe('SleepCyclesCard', () => {
  it('counts the cycles and gives their average length', () => {
    render(<SleepCyclesCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} />);

    const card = screen.getByTestId('cycles-card');
    expect(card).toHaveTextContent(/5 sleep cycles/);
    expect(card).toHaveTextContent(/avg 1h 29m/);
  });

  it('gives each cycle its length, start, and minutes per stage', () => {
    render(<SleepCyclesCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} />);

    const rows = screen.getAllByTestId('cycle-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(/^1\s*1h 32m\s*11:18 pm\s*Deep 45m · REM 18m · Light 29m$/);
    expect(rows[4]).toHaveTextContent(/5\s*1h 05m\s*5:40 am\s*Deep 0m · REM 25m · Light 40m/);
  });

  it('ends with what came after the last cycle', () => {
    render(<SleepCyclesCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} />);

    expect(screen.getByTestId('cycles-card')).toHaveTextContent(/Then 7 min awake before you got up\./);
  });

  it('says so when there is not enough REM to find a cycle', () => {
    render(<SleepCyclesCard stages={[seg('LIGHT', 0, 60), seg('DEEP', 60, 120)]} clock={UTC} />);

    expect(screen.getByTestId('cycles-card')).toHaveTextContent(/Not enough REM sleep to split this night into cycles\./);
    expect(screen.queryByTestId('cycle-row')).toBeNull();
  });

  it('speaks of one cycle in the singular', () => {
    render(<SleepCyclesCard stages={[seg('LIGHT', 0, 60), seg('REM', 60, 80)]} clock={UTC} />);

    expect(screen.getByTestId('cycles-card')).toHaveTextContent(/1 sleep cycle(?!s)/);
  });
});

describe('tailLine', () => {
  it('describes the end of the night, or nothing when the last cycle ends it', () => {
    expect(tailLine({ awakeMinutes: 7, sleepMinutes: 0 })).toBe('Then 7 min awake before you got up.');
    // The tail can hold any stage, so it is just "sleep".
    expect(tailLine({ awakeMinutes: 0, sleepMinutes: 12 })).toBe('Then 12 min of sleep before you woke.');
    expect(tailLine({ awakeMinutes: 3, sleepMinutes: 75 })).toBe('Then 1h 15m of sleep before you woke.');
    expect(tailLine({ awakeMinutes: 0, sleepMinutes: 0 })).toBeNull();
  });
});
