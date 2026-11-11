import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { BuddyRow } from '../../src/api/buddies';
import { HomeScene, type HomeSceneProps } from '../../src/components/home/HomeScene';
import { Kip } from '../../src/components/kip/Kip';
import { sceneState } from '../../src/lib/home/scene';
import { COLORS } from '../../src/theme';

const DAY = new Date(2026, 9, 13, 10, 0);
const NIGHT = new Date(2026, 9, 13, 22, 0);
const HIDDEN = { includeHiddenElements: true };
const buddy = (over: Partial<BuddyRow>): BuddyRow => ({
  id: 'b1', handle: 'ava', displayName: 'Ava', coachId: 'mochi', kipColour: 'mint', mood: 'good', moodLine: 'Feeling great', unseenSticker: false, ...over,
});
const READINGS: HomeSceneProps['readings'] = {
  sleep: { score: 78, duration: '7h 12m' },
  tomorrow: { low: 68, high: 76 },
  recovery: { score: 68, weather: 'mostlyClear', band: 'scoreGood' },
  recapsNew: 1,
};

function show(over: Partial<HomeSceneProps> = {}) {
  const onOpen = jest.fn();
  const onOpenBuddy = jest.fn();
  render(
    <HomeScene
      scene={sceneState({ now: DAY, recovery: 'mostlyClear', night: null })}
      width={390}
      extra={0}
      myColour="cobalt"
      buddies={null}
      readings={READINGS}
      onOpen={onOpen}
      onOpenBuddy={onOpenBuddy}
      {...over}
    />,
  );
  return { onOpen, onOpenBuddy };
}
const kip = (testID: string) => screen.UNSAFE_getAllByType(Kip).find((k) => k.props.testID === testID)!;
const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, HIDDEN).props.style);

describe('HomeScene tags', () => {
  it('shows each value with its spoken label, and opens its destination', () => {
    const { onOpen } = show();
    expect(within(screen.getByTestId('home-tag-sleep')).getByText('78')).toBeTruthy();
    expect(within(screen.getByTestId('home-tag-tomorrow')).getByText('68–76')).toBeTruthy();
    expect(within(screen.getByTestId('home-tag-recovery')).getByText('68')).toBeTruthy();
    expect(within(screen.getByTestId('home-tag-recaps')).getByText('1')).toBeTruthy();
    expect(screen.getByLabelText('Bed: sleep 78, 7h 12m. Open Sleep')).toBeTruthy();
    expect(screen.getByLabelText('Calendar: tomorrow likely 68 to 76. Open Tomorrow')).toBeTruthy();
    expect(screen.getByLabelText('Sky: recovery 68, mostly clear, Good. Open Recovery')).toBeTruthy();
    expect(screen.getByLabelText('Mailbox: recaps, 1 new. Open Recaps')).toBeTruthy();
    for (const target of ['sleep', 'tomorrow', 'recovery', 'recaps'] as const) {
      fireEvent.press(screen.getByTestId(`home-tag-${target}`));
      expect(onOpen).toHaveBeenLastCalledWith(target);
    }
  });

  it('shows "—" and "no reading yet" without values; RECAPS shows no number with nothing new', () => {
    show({ readings: { sleep: { score: null, duration: null }, tomorrow: null, recovery: null, recapsNew: 0 } });
    for (const tag of ['home-tag-sleep', 'home-tag-tomorrow', 'home-tag-recovery']) expect(within(screen.getByTestId(tag)).getByText('—')).toBeTruthy();
    expect(screen.getByLabelText('Sky: recovery, no reading yet. Open Recovery')).toBeTruthy();
    expect(screen.getByLabelText('Mailbox: recaps, no new recaps. Open Recaps')).toBeTruthy();
    expect(within(screen.getByTestId('home-tag-recaps')).queryByText('0')).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('RECOVERY').props.style).color).toBe(COLORS.dark.muted);
  });

  it('keys RECOVERY in the band colour', () => {
    show();
    expect(StyleSheet.flatten(screen.getByText('RECOVERY').props.style).color).toBe(COLORS.dark.scoreGood);
  });

  it('moves the tags and KIPs down with extra and across with the phone width', () => {
    show({ extra: 20, width: 375 });
    expect(styleOf('home-tag-recovery')).toMatchObject({ left: 208, top: 146 });
    expect(styleOf('home-scene-me-spot')).toMatchObject({ left: 164, top: 191 });
  });

  it('pulls RECAPS back on screen on a 360-point phone once measured', () => {
    show({ width: 360 });
    expect(styleOf('home-tag-recaps').left).toBe(281);
    fireEvent(screen.getByTestId('home-tag-recaps'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 90, height: 26 } } });
    const { left } = styleOf('home-tag-recaps');
    expect(left).toBe(266);
    expect(left + 90).toBeLessThanOrEqual(360 - 4);
  });
});

describe('HomeScene header', () => {
  it('draws the header over the art but ahead of the tags, so a screen reader reads it first', () => {
    show({ header: <View testID="test-header" /> });
    const tree = JSON.stringify(screen.toJSON());
    const order = ['home-scene-art', 'test-header', 'home-tag-sleep', 'home-tag-recaps'].map((id) => tree.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('HomeScene art and KIPs', () => {
  it('hides the art from screen readers and rains only when stormy', () => {
    show();
    expect(screen.getByTestId('home-scene-art', HIDDEN).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('home-scene-rain', HIDDEN)).toBeNull();
    screen.unmount();
    show({ scene: sceneState({ now: DAY, recovery: 'stormy', night: null }) });
    expect(screen.getByTestId('home-scene-rain', HIDDEN).props.pointerEvents).toBe('none');
  });

  it('draws your KIP in your colour, in the state\'s pose', () => {
    show();
    expect(kip('home-scene-me').props).toMatchObject({ colour: 'cobalt', pose: 'wave', mood: 'idle', scale: 5 });
  });

  it('draws two buddies in their colours and mood poses, and opens their week', () => {
    const { onOpenBuddy } = show({
      buddies: { buddies: [buddy({}), buddy({ id: 'b2', displayName: 'Bartholomew', kipColour: 'lilac', mood: 'low', moodLine: 'Taking it easy' })], total: 2, incomingRequests: 0 },
    });
    expect(kip('home-scene-buddy-b1').props).toMatchObject({ colour: 'mint', pose: 'cheer', mood: 'proud', scale: 3 });
    expect(kip('home-scene-buddy-b2').props).toMatchObject({ colour: 'lilac', pose: 'rest', mood: 'determined', scale: 3 });
    expect(within(screen.getByTestId('home-buddy-b2')).getByText('BARTHOL…')).toBeTruthy();
    expect(screen.getByLabelText('Bartholomew, Taking it easy. Open their week')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-buddy-b2'));
    expect(onOpenBuddy).toHaveBeenCalledWith('b2');
  });

  it('puts every buddy to sleep at night, and reads an unknown colour as coral', () => {
    show({ scene: sceneState({ now: NIGHT, recovery: 'clear', night: null }), buddies: { buddies: [buddy({ kipColour: 'purple' })], total: 1, incomingRequests: 0 } });
    expect(kip('home-scene-buddy-b1').props).toMatchObject({ colour: 'coral', pose: 'rest', mood: 'sleepy' });
  });
});

describe('HomeScene "ALL n →"', () => {
  it('counts every buddy and opens Social', () => {
    const { onOpen } = show({ buddies: { buddies: [buddy({})], total: 5, incomingRequests: 0 } });
    expect(within(screen.getByTestId('home-scene-all')).getByText('ALL 5 →')).toBeTruthy();
    expect(screen.getByLabelText('All 5 buddies. Open Social')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-scene-all'));
    expect(onOpen).toHaveBeenCalledWith('buddies');
  });

  it('reads the requests instead when there are any', () => {
    show({ buddies: { buddies: [], total: 0, incomingRequests: 3 } });
    expect(within(screen.getByTestId('home-scene-all')).getByText('3 REQUESTS →')).toBeTruthy();
    expect(screen.getByLabelText('3 buddy requests. Open Social')).toBeTruthy();
    screen.unmount();
    show({ buddies: { buddies: [], total: 2, incomingRequests: 1 } });
    expect(within(screen.getByTestId('home-scene-all')).getByText('1 REQUEST →')).toBeTruthy();
    expect(screen.getByLabelText('1 buddy request. Open Social')).toBeTruthy();
  });

  it('sits on its own row below the name tags, right-aligned to the board\'s 382', () => {
    show({ extra: 20, buddies: { buddies: [buddy({}), buddy({ id: 'b2' })], total: 2, incomingRequests: 3 } });
    expect(styleOf('home-scene-all')).toMatchObject({ right: 8, top: 298 });
    expect(styleOf('home-buddy-b2').top).toBe(274);
  });

  it('keeps its tap area clear of the name tags above it', () => {
    show({ buddies: { buddies: [buddy({})], total: 5, incomingRequests: 0 } });
    expect(screen.getByTestId('home-buddy-b1').props.hitSlop).toEqual({ top: 8, bottom: 4, left: 8, right: 8 });
    expect(screen.getByTestId('home-scene-all').props.hitSlop).toEqual({ top: 4, bottom: 8, left: 8, right: 8 });
  });

  it('is hidden with no buddies and no requests, and on an older server', () => {
    show({ buddies: { buddies: [], total: 0, incomingRequests: 0 } });
    expect(screen.queryByTestId('home-scene-all')).toBeNull();
    screen.unmount();
    show({ buddies: null });
    expect(screen.queryByTestId('home-scene-all')).toBeNull();
    expect(screen.UNSAFE_getAllByType(Kip)).toHaveLength(1);
  });
});
