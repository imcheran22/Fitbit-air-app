import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CampBanner } from '../../src/components/social/CampBanner';
import { PersonKip } from '../../src/components/kip/PersonKip';

it('from an S1 server: a static strip with the check-in count and up to two faces', () => {
  render(<CampBanner camp={{ checkedIn: 4, members: 5, faces: ['mochi', 'boba', 'kit'] }} />);
  expect(screen.getByTestId('camp-banner')).toHaveTextContent(/THE CAMP.*4 checked in/);
  expect(screen.getByTestId('camp-banner').props.accessibilityRole).toBe('summary');
  expect(screen.getByTestId('camp-face-1')).toBeTruthy();
  expect(screen.queryByTestId('camp-face-2')).toBeNull();
});

it("draws each face as that buddy's KIP, and coral when an older server sends no colours", () => {
  const { rerender } = render(<CampBanner camp={{ checkedIn: 2, members: 3, faces: ['sol', 'mira'], faceColours: ['mint', 'ink'] }} />);
  const kips = screen.UNSAFE_getAllByType(PersonKip);
  expect(kips.map((k) => k.props.colour)).toEqual(['mint', 'ink']);
  expect(kips[0]!.props.size).toBe(26);
  rerender(<CampBanner camp={{ checkedIn: 2, members: 3, faces: ['sol', 'mira'] }} />);
  expect(screen.UNSAFE_getAllByType(PersonKip).map((k) => k.props.colour)).toEqual([undefined, undefined]);
});

it('at night: who is awake and asleep, and a tap opens the camp', () => {
  const onOpen = jest.fn();
  render(<CampBanner camp={{ checkedIn: 1, members: 5, faces: [], night: true, awake: 3, asleep: 2 }} onOpen={onOpen} />);
  expect(screen.getByTestId('camp-banner-line')).toHaveTextContent('3 awake · 2 asleep');
  expect(screen.getByLabelText('Open the camp, 3 awake · 2 asleep')).toBeTruthy();
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('by day on an S2 server: the check-in count, still opening the camp', () => {
  const onOpen = jest.fn();
  render(<CampBanner camp={{ checkedIn: 2, members: 5, faces: [], night: false, awake: 5, asleep: 0 }} onOpen={onOpen} />);
  expect(screen.getByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
