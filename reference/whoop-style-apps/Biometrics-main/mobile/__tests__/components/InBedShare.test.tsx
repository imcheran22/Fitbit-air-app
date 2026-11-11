import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { InBedShare } from '../../src/components/sleep/InBedShare';

it('shows the in-bed time and the share of it asleep', () => {
  render(<InBedShare minutesAsleep={430} minutesInBed={452} testID="share" />);
  expect(screen.getByTestId('share')).toHaveTextContent('7h 32m in bed · 95% of it asleep');
});
