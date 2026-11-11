import React from 'react';
import { render } from '@testing-library/react-native';
import { BaselineProgressRing } from '../../src/components/ui/baseline-progress-ring';

describe('BaselineProgressRing', () => {
  it('reads "9/14 days"', () => {
    const { getByText } = render(<BaselineProgressRing daysCollected={9} daysRequired={14} />);

    expect(getByText('9/14 days')).toBeTruthy();
  });

  it('draws one tick per required day, filling as many as have been collected', () => {
    const { getAllByTestId, queryAllByTestId } = render(<BaselineProgressRing daysCollected={9} daysRequired={14} />);

    expect(getAllByTestId(/^baseline-tick-filled-/)).toHaveLength(9);
    expect(queryAllByTestId(/^baseline-tick-empty-/)).toHaveLength(5);
  });

  it('clamps out-of-range counts', () => {
    const over = render(<BaselineProgressRing daysCollected={20} daysRequired={14} />);
    expect(over.getAllByTestId(/^baseline-tick-filled-/)).toHaveLength(14);
    expect(over.getByText('14/14 days')).toBeTruthy();

    const under = render(<BaselineProgressRing daysCollected={-3} daysRequired={14} />);
    expect(under.queryAllByTestId(/^baseline-tick-filled-/)).toHaveLength(0);
    expect(under.getByText('0/14 days')).toBeTruthy();
  });

  it('is announced as a baseline in progress, so it is never mistaken for a low score', () => {
    const { getByTestId } = render(<BaselineProgressRing daysCollected={9} daysRequired={14} />);

    expect(getByTestId('baseline-progress-ring').props.accessibilityLabel).toBe('Building your baseline: 9 of 14 days');
  });

  it('is visually distinct from a score ring: ticks, not a continuous fill arc', () => {
    const { queryByTestId } = render(<BaselineProgressRing daysCollected={9} daysRequired={14} />);

    expect(queryByTestId('score-ring')).toBeNull();
  });

  it('matches its snapshot', () => {
    expect(render(<BaselineProgressRing daysCollected={9} daysRequired={14} />).toJSON()).toMatchSnapshot();
  });
});
