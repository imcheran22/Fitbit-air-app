import React from 'react';
import { render } from '@testing-library/react-native';
import type { BuddyRow } from '../../src/api/buddies';
import { BuddyListRow } from '../../src/components/buddies/BuddyListRow';
import { PersonKip } from '../../src/components/kip/PersonKip';

const row: BuddyRow = { id: 'b1', handle: 'ava', displayName: 'Ava', coachId: 'sol', kipColour: 'lime', mood: 'good', moodLine: 'Feeling great', unseenSticker: false };

it('draws the buddy as their KIP in their colour, cheering on a good day', () => {
  const { UNSAFE_getByType } = render(<BuddyListRow row={row} onPress={() => {}} />);
  expect(UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lime', state: 'good', size: 48 });
});

it('draws a buddy running low in the low pose, leaving a colour an older server did not send to PersonKip', () => {
  const { UNSAFE_getByType } = render(<BuddyListRow row={{ ...row, kipColour: undefined, mood: 'low' }} onPress={() => {}} />);
  expect(UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: undefined, state: 'low', size: 48 });
});
