import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { saveCheckIn } from '../../src/api/social';
import { refreshSocial } from '../../src/lib/socialStore';
import { CheckInSheet } from '../../src/components/social/CheckInSheet';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), saveCheckIn: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const save = saveCheckIn as jest.Mock;
beforeEach(() => { save.mockReset(); (refreshSocial as jest.Mock).mockReset(); });

it('saves once on a double tap, refreshes Social and closes', async () => {
  let resolve!: (v: unknown) => void;
  save.mockReturnValue(new Promise((r) => { resolve = r; }));
  const onClose = jest.fn();
  render(<CheckInSheet visible current={null} onClose={onClose} />);
  expect(screen.getByTestId('checkin-notice')).toHaveTextContent(/^Your buddies will see this\./);
  act(() => {
    fireEvent.press(screen.getByTestId('checkin-TIRED'));
    fireEvent.press(screen.getByTestId('checkin-TIRED'));
  });
  await act(async () => resolve({ checkIn: { mood: 'TIRED', localDate: '2026-10-07', updatedAt: '' } }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('TIRED');
  expect(refreshSocial).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('shows an error and stays open when saving fails', async () => {
  save.mockRejectedValue(new Error('offline'));
  const onClose = jest.fn();
  render(<CheckInSheet visible current="OKAY" onClose={onClose} />);
  await act(async () => fireEvent.press(screen.getByTestId('checkin-RESTED')));
  expect(screen.getByTestId('checkin-message')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

it("marks today's mood as the selected, filled option", () => {
  render(<CheckInSheet visible current="OKAY" onClose={jest.fn()} />);
  expect(screen.getByTestId('checkin-OKAY').props.accessibilityState).toMatchObject({ selected: true, disabled: false });
  expect(screen.getByTestId('checkin-RESTED').props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByTestId('checkin-OKAY').props.accessibilityRole).toBe('button');
});
