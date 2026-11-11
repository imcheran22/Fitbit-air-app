import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { MOCKUP_CLOCK, MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { nightClock } from '../../src/lib/sleepStats';

const UTC = nightClock({ bedtime: '00:00', startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 }, []);
import { MomentsCard } from '../../src/components/sleep/MomentsCard';

describe('MomentsCard', () => {
  it('shows the stage mix of time asleep around the total', () => {
    render(<MomentsCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} minutesToFallAsleep={null} minutesAsleep={444} />);

    const card = screen.getByTestId('moments-card');
    expect(card).toHaveTextContent(/7h 24m\s*asleep/);
    // 444 min asleep: deep 90, light 231, REM 123.
    expect(card).toHaveTextContent(/Deep\s*1h 30m\s*20%/);
    expect(card).toHaveTextContent(/Light\s*3h 51m\s*52%/);
    expect(card).toHaveTextContent(/REM\s*2h 03m\s*28%/);
    expect(screen.getByLabelText('Stage mix: deep 20 percent, light 52 percent, REM 28 percent of time asleep')).toBeTruthy();
  });

  it('puts the night\'s own time asleep in the centre, the same number as the header', () => {
    render(<MomentsCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} minutesToFallAsleep={null} minutesAsleep={450} />);

    const card = screen.getByTestId('moments-card');
    expect(card).toHaveTextContent(/7h 30m\s*asleep/);
    // The slices and rows stay shares of the stage sums.
    expect(card).toHaveTextContent(/Deep\s*1h 30m\s*20%/);
  });

  it('shrinks a long night to fit inside the ring\'s hole, on one line', () => {
    render(<MomentsCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} minutesToFallAsleep={null} minutesAsleep={659} />);

    const centre = screen.getByText('10h 59m');
    expect(centre.props.numberOfLines).toBe(1);
    expect(centre.props.adjustsFontSizeToFit).toBe(true);
    // The hole is 84 across: the value must stay inside it, clear of the band.
    expect(StyleSheet.flatten(centre.props.style).maxWidth).toBeLessThanOrEqual(80);
  });

  it('lists the night\'s highlights in order', () => {
    render(<MomentsCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} minutesToFallAsleep={null} minutesAsleep={444} />);

    const rows = screen.getAllByTestId('moment-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent(/Fell asleep\s*after getting into bed\s*8m/);
    expect(rows[1]).toHaveTextContent(/Deepest stretch\s*from 11:35 pm\s*45m/);
    expect(rows[2]).toHaveTextContent(/Longest dream sleep\s*from 5:10 am\s*30m/);
    expect(rows[3]).toHaveTextContent(/Woke during the night\s*3m at 3:35 am\s*1×/);
  });

  it('uses the night\'s own time to fall asleep when it has one', () => {
    render(<MomentsCard stages={MOCKUP_SEGMENTS} clock={MOCKUP_CLOCK} minutesToFallAsleep={12} minutesAsleep={444} />);

    expect(screen.getAllByTestId('moment-row')[0]).toHaveTextContent(/Fell asleep\s*after getting into bed\s*12m/);
  });

  it('leaves out highlights the night does not have', () => {
    render(<MomentsCard stages={[seg('LIGHT', 0, 60), seg('DEEP', 60, 100), seg('LIGHT', 100, 150)]} clock={UTC} minutesToFallAsleep={null} minutesAsleep={444} />);

    const rows = screen.getAllByTestId('moment-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Fell asleep/);
    expect(rows[1]).toHaveTextContent(/Deepest stretch/);
    expect(screen.queryByText('Longest dream sleep')).toBeNull();
    expect(screen.queryByText('Woke during the night')).toBeNull();
  });
});
