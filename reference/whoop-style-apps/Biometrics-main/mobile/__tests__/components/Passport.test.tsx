import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import { Passport, type PassportProps } from '../../src/components/profile/Passport';
import { KIP_COLOURS } from '../../src/lib/kip/kipArt';
import { resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

const props = (over: Partial<PassportProps> = {}): PassportProps => ({
  code: 'KIP-7Q4M',
  name: 'Tushar',
  handle: 'tushar',
  home: 'Europe/London',
  joinedOn: '2026-03-14',
  checkInStreak: 12,
  buddyCount: 3,
  stamps: [
    { family: 'CHECK_IN', level: 3, short: 'CHECK-IN' },
    { family: 'SLEEP_GOAL', level: 2, short: 'SLEEP' },
  ],
  recap: null,
  onEdit: jest.fn(),
  onOpenStamp: jest.fn(),
  ...over,
});

describe('Passport', () => {
  afterEach(() => {
    act(() => resetMyKipColour());
  });

  it('shows the number, the fields, the check-in streak and the buddy count', () => {
    render(<Passport {...props()} />);

    expect(screen.getByText('Biometrics · passport')).toBeTruthy();
    expect(screen.getByTestId('passport-number')).toHaveTextContent('NO. KIP-7Q4M');
    expect(screen.getByTestId('passport-name')).toHaveTextContent('Tushar');
    expect(screen.getByTestId('passport-handle')).toHaveTextContent('@tushar');
    expect(screen.getByTestId('passport-home')).toHaveTextContent('Europe/London');
    expect(screen.getByTestId('passport-joined')).toHaveTextContent('14 MAR 2026');
    expect(screen.getByText('CHECK-IN STREAK')).toBeTruthy();
    expect(screen.getByTestId('passport-streak')).toHaveTextContent('12 days');
    expect(screen.getByTestId('passport-buddies')).toHaveTextContent('3');
  });

  it('shows a dash for anything not known yet', () => {
    render(<Passport {...props({ name: null, handle: null, joinedOn: null, checkInStreak: null, buddyCount: null })} />);

    for (const id of ['passport-name', 'passport-handle', 'passport-joined', 'passport-streak', 'passport-buddies']) {
      expect(screen.getByTestId(id)).toHaveTextContent('—');
    }
  });

  it('draws KIP in coral inside a coral frame when there is no recap, and the photo is not a button', () => {
    render(<Passport {...props()} />);

    expect(StyleSheet.flatten(screen.getByTestId('passport-photo').props.style).borderColor).toBe(KIP_COLOURS.coral);
    expect(screen.getByTestId('passport-kip', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('passport-recap')).toBeNull();
  });

  it('draws your KIP in your colour', () => {
    act(() => setMyKipColour('cobalt'));
    render(<Passport {...props()} />);

    const kip = screen.getByTestId('passport-kip', { includeHiddenElements: true });
    expect(kip.findAll((n) => n.type === Rect && n.props.fill === KIP_COLOURS.cobalt).length).toBeGreaterThan(0);
  });

  it('rings the photo in the recap colour and plays it on tap', () => {
    const onPlay = jest.fn();
    render(<Passport {...props({ recap: { color: '#22D3EE', hint: 'New recap', onPlay } })} />);

    expect(StyleSheet.flatten(screen.getByTestId('passport-photo').props.style).borderColor).toBe('#22D3EE');
    fireEvent.press(screen.getByRole('button', { name: 'Your KIP. New recap' }));
    expect(onPlay).toHaveBeenCalled();
  });

  it('opens a stamp’s badge, and Edit opens the identity editor', () => {
    const onOpenStamp = jest.fn();
    const onEdit = jest.fn();
    render(<Passport {...props({ onOpenStamp, onEdit })} />);

    expect(screen.getAllByTestId(/^passport-stamp-[A-Z_]+$/).map((s) => s.props.testID)).toEqual([
      'passport-stamp-CHECK_IN',
      'passport-stamp-SLEEP_GOAL',
    ]);
    expect(screen.getByText('CHECK-IN')).toBeTruthy();
    fireEvent.press(screen.getByTestId('passport-stamp-SLEEP_GOAL'));
    expect(onOpenStamp).toHaveBeenCalledWith('SLEEP_GOAL');
    fireEvent.press(screen.getByRole('button', { name: 'Edit your name and handle' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('says where stamps will go when none are earned', () => {
    render(<Passport {...props({ stamps: [] })} />);

    expect(screen.getByTestId('passport-no-stamps')).toHaveTextContent('Badges you earn are stamped here.');
    expect(screen.queryByTestId('passport-stamps')).toBeNull();
  });

  it('writes the two passport lines, hidden from screen readers', () => {
    render(<Passport {...props()} />);

    expect(screen.queryByText('P<KIP<<TUSHAR<<<<<<<<<<<<<<<<<<<')).toBeNull();
    expect(screen.getByText('P<KIP<<TUSHAR<<<<<<<<<<<<<<<<<<<', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('KIP7Q4M<<260314<<EUROPE<LONDON<<', { includeHiddenElements: true })).toBeTruthy();
  });
});
