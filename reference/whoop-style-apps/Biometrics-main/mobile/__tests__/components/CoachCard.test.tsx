import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { CoachCard } from '../../src/components/characters/CoachCard';
import { CHARACTERS } from '../../src/components/characters/registry';
import type { CharacterId } from '../../src/components/characters/types';
import { characterLabel } from '../../jest-mocks/characterContext';
import { FONTS } from '../../src/theme';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({ colorScheme: mockScheme, setColorScheme: jest.fn(), toggleColorScheme: jest.fn() }),
}));

afterEach(() => {
  mockScheme = 'light';
});

// WCAG 2 relative luminance and contrast ratio, computed independently of the component.
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
// The chip's real fill: its 16 % accent wash over the art panel's 10 % top
// wash over the card (white in light mode, global.css dark --color-card 20 22 27).
const CARD_RGB = { light: [255, 255, 255], dark: [20, 22, 27] } as const;
const chipFill = (accent: string, scheme: 'light' | 'dark') => {
  const a = channels(accent);
  const panel = CARD_RGB[scheme].map((c, i) => c * 0.9 + a[i]! * 0.1);
  return '#' + panel.map((c, i) => Math.round(c * 0.84 + a[i]! * 0.16).toString(16).padStart(2, '0')).join('');
};
const focusColor = (s: ReturnType<typeof render>) =>
  (StyleSheet.flatten(s.getByTestId('coach-card-focus').props.style) as { color: string }).color;
const IDS = Object.keys(CHARACTERS) as CharacterId[];

it('shows number, focus, name, tagline and greeting, with the coach idle at 120', () => {
  const s = render(<CoachCard characterId="kit" testID="card" />);
  expect(s.getByText('No.07')).toBeTruthy();
  expect(s.getByText('Bedtime')).toBeTruthy();
  expect(s.getByText('Kit')).toBeTruthy();
  expect(s.getByText('Dry wit. Gently judges your bedtime.')).toBeTruthy();
  expect(characterLabel(s, 'card')).toBe('character:kit:idle:120:playing:none');
});

it('prefers server copy when given', () => {
  const s = render(<CoachCard characterId="kit" tagline="Server tagline" greeting="Server hi" />);
  expect(s.getByText('Server tagline')).toBeTruthy();
  expect(s.getByText('Server hi')).toBeTruthy();
});

it('pads single-digit numbers and passes paused through to the sprite', () => {
  const s = render(<CoachCard characterId="mochi" paused testID="card" />);
  expect(s.getByText('No.01')).toBeTruthy();
  expect(characterLabel(s, 'card')).toBe('character:mochi:idle:120:paused:none');
});

it('announces the coach name as a header', () => {
  const s = render(<CoachCard characterId="kit" />);
  expect(s.getByRole('header', { name: 'Kit' })).toBeTruthy();
});

it('has 15 coaches to check', () => {
  expect(IDS).toHaveLength(15);
});

describe.each(['light', 'dark'] as const)('%s mode', (scheme) => {
  it.each(IDS)('%s focus chip text reads at 4.5:1 or better on the composited chip', (id) => {
    mockScheme = scheme;
    const s = render(<CoachCard characterId={id} />);
    expect(contrast(focusColor(s), chipFill(CHARACTERS[id].accent, scheme))).toBeGreaterThanOrEqual(4.5);
  });
});

it('dark mode lightens accents that are too dim on the dark chip, and keeps ones that read', () => {
  mockScheme = 'dark';
  expect(focusColor(render(<CoachCard characterId="cap" />))).not.toBe(CHARACTERS.cap.accent);
  expect(focusColor(render(<CoachCard characterId="luna" />))).toBe(CHARACTERS.luna.accent);
});

it('sets the number in the pixel label face, not a system mono, and the name as a Geist heading', () => {
  const s = render(<CoachCard characterId="mochi" paused testID="card" />);
  expect(StyleSheet.flatten(s.getByText('No.01').props.style).fontFamily).toBe(FONTS.pixel);
  expect(String(s.getByText('No.01').props.className).split(' ')).toContain('text-label');
  expect(StyleSheet.flatten(s.getByRole('header', { name: 'Mochi' }).props.style).fontFamily).toBe(FONTS.sansSemibold);
});
