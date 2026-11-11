import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { KipColourSection } from '../../src/components/profile/KipColourSection';
import { fetchIdentity } from '../../src/api/buddies';
import { saveKipColour } from '../../src/api/kip';
import { getMyKipColour, loadMyKipColour, resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

jest.mock('../../src/api/kip', () => ({ saveKipColour: jest.fn() }));
jest.mock('../../src/api/buddies', () => ({ fetchIdentity: jest.fn() }));
const save = saveKipColour as jest.Mock;
const identity = fetchIdentity as jest.Mock;

beforeEach(() => {
  save.mockReset();
  identity.mockReset();
  resetMyKipColour();
});

it('reads your colour again on opening when the start-up read failed', async () => {
  identity.mockRejectedValueOnce(new Error('offline'));
  await loadMyKipColour();
  identity.mockResolvedValueOnce({ kipColour: 'lime' });
  render(<KipColourSection />);
  await waitFor(() => expect(screen.getByTestId('kip-swatch-lime').props.accessibilityState).toMatchObject({ checked: true }));
  expect(identity).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
});

it('does not read again on opening when your colour loaded', () => {
  render(<KipColourSection />);
  expect(identity).not.toHaveBeenCalled();
});

it('shows your colour in the preview and as the checked radio among 10', () => {
  act(() => setMyKipColour('lilac'));
  render(<KipColourSection />);
  expect(screen.getByText('Lilac · #C4B5FD')).toBeTruthy();
  expect(screen.getByLabelText('Your KIP in Lilac')).toBeTruthy();
  const group = screen.getByTestId('kip-colour-swatches');
  expect(group.props.accessibilityRole).toBe('radiogroup');
  expect(group.props.accessibilityLabel).toBe('KIP colour');
  const radios = screen.getAllByRole('radio');
  expect(radios).toHaveLength(10);
  expect(screen.getByTestId('kip-swatch-lilac').props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByTestId('kip-swatch-coral').props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.getByText('Buddies see this colour')).toBeTruthy();
});

it('follows your colour when it loads after the page opens, until you pick', () => {
  render(<KipColourSection />);
  act(() => setMyKipColour('sky'));
  expect(screen.getByText('Sky · #7DD3FC')).toBeTruthy();
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
});

it('picking changes only the preview until Save, which is off until the pick differs', () => {
  render(<KipColourSection />);
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId('kip-swatch-mint'));
  expect(screen.getByText('Mint · #6EE7B7')).toBeTruthy();
  expect(getMyKipColour()).toBe('coral');
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: false });
});

it('Save stores the colour for every screen', async () => {
  save.mockResolvedValue({ kipColour: 'mint' });
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-swatch-mint'));
  fireEvent.press(screen.getByTestId('kip-colour-save'));
  await waitFor(() => expect(getMyKipColour()).toBe('mint'));
  expect(save).toHaveBeenCalledWith('mint');
  expect(screen.getByTestId('kip-colour-save').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByTestId('kip-swatch-mint').props.accessibilityState).toMatchObject({ checked: true });
});

it('a failed save keeps the old colour and offers Try again', async () => {
  save.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ kipColour: 'ink' });
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-swatch-ink'));
  fireEvent.press(screen.getByTestId('kip-colour-save'));
  expect(await screen.findByText("Your colour couldn't be saved.")).toBeTruthy();
  expect(getMyKipColour()).toBe('coral');
  fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(getMyKipColour()).toBe('ink'));
  expect(screen.queryByTestId('kip-colour-error')).toBeNull();
});

it('clears the error when you pick another colour', async () => {
  save.mockRejectedValueOnce(new Error('offline'));
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-swatch-ink'));
  fireEvent.press(screen.getByTestId('kip-colour-save'));
  expect(await screen.findByText("Your colour couldn't be saved.")).toBeTruthy();
  expect(screen.getByTestId('kip-colour-error').props.accessibilityLiveRegion).toBe('polite');
  fireEvent.press(screen.getByTestId('kip-swatch-lime'));
  expect(screen.queryByTestId('kip-colour-error')).toBeNull();
});

const layout = (width: number) =>
  fireEvent(screen.getByTestId('kip-colour-preview'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 192 } } });
const SUN = ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B'];

it('widens the scene to fill its card and centres the KIP', () => {
  render(<KipColourSection />);
  layout(390);
  const svg = within(screen.getByTestId('kip-colour-scene', { includeHiddenElements: true })).UNSAFE_getByType(Svg);
  expect(svg.props.width).toBe(Math.ceil(390 / 3) * 3);
  expect(svg.props.width).toBeGreaterThanOrEqual(390);
  expect(StyleSheet.flatten(screen.getByTestId('kip-colour-hero').props.style).left).toBe(390 / 2 - 48);
});

it('keeps the sun inside a narrow card', () => {
  render(<KipColourSection />);
  layout(335);
  const cols = Math.ceil(335 / 3);
  const sun = within(screen.getByTestId('kip-colour-scene', { includeHiddenElements: true }))
    .UNSAFE_getAllByType(Rect)
    .filter((r) => SUN.includes(r.props.fill));
  expect(sun.length).toBeGreaterThan(0);
  for (const r of sun) {
    expect(r.props.x).toBeGreaterThanOrEqual(0);
    expect(r.props.x + r.props.width).toBeLessThanOrEqual(cols);
  }
  expect(Math.max(...sun.map((r) => r.props.x + r.props.width))).toBe(cols - 7);
});

it('Reset to coral only changes the selection', () => {
  act(() => setMyKipColour('slate'));
  render(<KipColourSection />);
  fireEvent.press(screen.getByTestId('kip-colour-reset'));
  expect(screen.getByTestId('kip-swatch-coral').props.accessibilityState).toMatchObject({ checked: true });
  expect(getMyKipColour()).toBe('slate');
  expect(save).not.toHaveBeenCalled();
});
