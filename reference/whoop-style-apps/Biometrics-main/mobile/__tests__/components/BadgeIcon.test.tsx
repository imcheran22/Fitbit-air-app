import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { BadgeIcon } from '../../src/components/achievements/BadgeIcon';

it('names the family, level and tier for screen readers, and fills one pip per level', () => {
  render(<BadgeIcon family="SLEEP_GOAL" level={3} size={58} testID="b" />);
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Sleep goal streak, level III, Gold');
  for (const i of [1, 2, 3]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#FACC15', width: 4, height: 4 });
  for (const i of [4, 5]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#3F3F46' });
});

it('draws a locked badge grey', () => {
  render(<BadgeIcon family="CHECK_IN" level={0} size={58} testID="b" />);
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Daily check-in, locked');
  for (const i of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#3F3F46' });
});

it("draws level V in the user's coach colour", () => {
  render(withCharacter(<BadgeIcon family="STEP_GOAL" level={5} size={100} testID="b" />, { characterId: 'sprout' }));
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Step goal streak, level V, Coach');
  expect(screen.getByTestId('b-pip-5')).toHaveStyle({ backgroundColor: '#4ADE80', width: 7, height: 7 });
});

it('takes an explicit coach colour and can leave the pips out', () => {
  render(<BadgeIcon family="SLEEP_GOAL" level={5} size={44} pips={false} coachAccent="#E0B48A" testID="b" />);
  expect(screen.queryByTestId('b-pips')).toBeNull();
});
