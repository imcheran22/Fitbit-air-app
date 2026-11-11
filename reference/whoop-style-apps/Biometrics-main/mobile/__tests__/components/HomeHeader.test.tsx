import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HomeHeader, ProfileButton } from '../../src/components/home/HomeHeader';
import { Kip } from '../../src/components/kip/Kip';
import { StoryRing } from '../../src/components/recap/StoryRing';
import { Button } from '../../src/components/ui/button';
import { SectionLabel } from '../../src/components/ui/section-label';
import { ThemeToggle } from '../../src/components/ui/theme-toggle';
import { sceneState, STATES } from '../../src/lib/home/scene';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const syncModule = require('../../src/sync/SyncProvider');
const syncLineText = () => screen.UNSAFE_getAllByType(Button).find((b) => b.props.testID === 'sync-status-line')!.props.textClassName;

const NOW = new Date(2026, 9, 13, 9, 0);
const ring = { color: '#A78BFA', hint: 'Your week is ready. Play your story', destination: { name: 'RecapStory', params: { id: 'w1' } } } as never;

beforeEach(() => {
  jest.spyOn(syncModule, 'useSync').mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow: jest.fn() } as never);
});
afterEach(() => jest.restoreAllMocks());

function show(onBottom = jest.fn(), onProfile = jest.fn(), now = NOW, { top = 52, extra = 12 } = {}) {
  render(
    <HomeHeader top={top} extra={extra} now={now} greeting="Good morning" scene={sceneState({ now, recovery: 'clear', night: null })}
      myColour="mint" ring={null} onProfile={onProfile} onBottom={onBottom} />,
  );
  return { onBottom, onProfile };
}
const ringSurface = () => screen.UNSAFE_getAllByType(StoryRing).find((n) => n.props.testID === 'profile-story-ring')!.props.surface;

it('shows the date, the greeting, the sync line, the theme toggle and the Profile ring, all light', () => {
  show();
  expect(screen.getByText('Tue, Oct 13')).toBeTruthy();
  expect(screen.getByText('Good morning')).toBeTruthy();
  expect(screen.getByTestId('sync-status-line')).toBeTruthy();
  expect(screen.getByTestId('theme-toggle-button')).toBeTruthy();
  expect(screen.getByTestId('settings-button').props.accessibilityLabel).toBe('Profile and settings');
  expect(StyleSheet.flatten(screen.getByText('Good morning').props.style).color).toBe('#F5F5F4');
  expect(syncLineText()).toBe('text-[#FFFFFF]');
  expect(screen.UNSAFE_getByType(SectionLabel).props.className).toBe('text-[#E5E7EB]');
  expect(screen.UNSAFE_getByType(ThemeToggle).props.color).toBe('#F5F5F4');
});

it('sits at the top it is given and reports its bottom edge', () => {
  const { onBottom } = show();
  expect(StyleSheet.flatten(screen.getByTestId('home-header').props.style).top).toBe(52);
  fireEvent(screen.getByTestId('home-header'), 'layout', { nativeEvent: { layout: { x: 0, y: 52, width: 390, height: 70 } } });
  expect(onBottom).toHaveBeenCalledWith(122);
});

it('draws your KIP in the Profile ring and opens Profile', () => {
  const { onProfile } = show();
  const k = screen.UNSAFE_getAllByType(Kip).find((n) => n.props.testID === 'profile-kip')!;
  expect(k.props).toMatchObject({ colour: 'mint', scale: 2 });
  fireEvent.press(screen.getByTestId('settings-button'));
  expect(onProfile).toHaveBeenCalled();
});

it('gaps the Profile ring in the sky band behind its centre', () => {
  const layout = (y: number, height: number) =>
    fireEvent(screen.getByTestId('home-header'), 'layout', { nativeEvent: { layout: { x: 0, y, width: 390, height } } });
  // Header bottom 122 with 12 points of extra sky: the ring's centre, 25.5 above that bottom, is 96.5 down, in band 1.
  show();
  layout(52, 70);
  expect(ringSurface()).toBe(STATES.clear.sky[1]);
  screen.unmount();
  show(jest.fn(), jest.fn(), new Date(2026, 9, 13, 22, 0));
  layout(52, 70);
  expect(ringSurface()).toBe(STATES.night.sky[1]);
  screen.unmount();
  // A short header under a 20-point status bar: no extra sky, and the centre (52) is still in band 0.
  show(jest.fn(), jest.fn(), NOW, { top: 28, extra: 0 });
  layout(28, 49.5);
  expect(ringSurface()).toBe(STATES.clear.sky[0]);
});

it('speaks the recap ring\'s hint', () => {
  render(<ProfileButton ring={ring} surface="#2563B8" colour="coral" onPress={jest.fn()} />);
  expect(screen.getByTestId('settings-button').props.accessibilityLabel).toBe('Profile. Your week is ready. Play your story');
});
