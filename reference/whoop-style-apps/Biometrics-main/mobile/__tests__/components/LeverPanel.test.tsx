import React from 'react';
import { render } from '@testing-library/react-native';
import { LeverPanel } from '../../src/components/forecast/lever-panel';
import type { ForecastLeverDTO } from '../../src/api/forecast';

const longLabel = 'Glasses of water before an afternoon tea';

const lever: ForecastLeverDTO = {
  key: 'WATER',
  label: longLabel,
  unit: 'glasses',
  min: 0,
  max: 12,
  step: 1,
  effect: 'CONFIRMED',
};

describe('LeverPanel', () => {
  it('wraps a long lever label so its value stays on the card', () => {
    const { getByText } = render(
      <LeverPanel levers={[lever]} values={{ sleepHours: 7.5, habits: { WATER: 10 } }} onChange={jest.fn()} onReset={jest.fn()} />,
    );
    const label = getByText(longLabel);
    expect(String(label.props.className).split(' ')).toEqual(expect.arrayContaining(['flex-1']));
    expect(label.props.numberOfLines).toBeUndefined();
    const value = getByText('10 glasses');
    expect(String(value.props.className).split(' ')).not.toContain('flex-1');
  });
});
