import React from 'react';
import { render } from '@testing-library/react-native';
import { ConfidenceBadge } from '../../src/components/ui/confidence-badge';

describe('ConfidenceBadge', () => {
  it.each([
    ['HIGH', 'High confidence'],
    ['MEDIUM', 'Medium confidence'],
    ['LOW', 'Low confidence'],
  ] as const)('says %s in words, not just colour', (level, text) => {
    const { getByText, getByTestId } = render(<ConfidenceBadge level={level} />);

    expect(getByText(text)).toBeTruthy();
    expect(getByTestId('confidence-badge').props.accessibilityLabel).toBe(text);
  });

  it.each(['HIGH', 'MEDIUM', 'LOW'] as const)('matches its snapshot for %s', (level) => {
    expect(render(<ConfidenceBadge level={level} />).toJSON()).toMatchSnapshot();
  });
});
