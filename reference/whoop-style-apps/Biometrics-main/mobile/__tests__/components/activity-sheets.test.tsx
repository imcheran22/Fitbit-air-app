import React from 'react';
import { render } from '@testing-library/react-native';
import { DayDetail } from '../../src/components/activity-sheets';
import { makeNight } from '../../jest-mocks/sleepPageFixture';

describe('DayDetail', () => {
  it('the sleep link shows main sleep, and No data for a nap-only date', () => {
    const { getByTestId, rerender } = render(
      <DayDetail date="2026-10-07" steps={9000} goal={10000} average={null} sleepLink={{ night: makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418 }), onPress: jest.fn() }} />,
    );
    expect(getByTestId('day-detail-sleep-link')).toHaveTextContent(/6h 58m/);
    rerender(<DayDetail date="2026-10-07" steps={9000} goal={10000} average={null} sleepLink={{ night: makeNight('2026-10-07', { mainIsNap: true }), onPress: jest.fn() }} />);
    expect(getByTestId('day-detail-sleep-link')).toHaveTextContent(/No data/);
  });
});
