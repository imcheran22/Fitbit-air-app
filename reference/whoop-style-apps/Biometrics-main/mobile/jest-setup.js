jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
require('react-native-reanimated').setUpTests();

// The real CharacterCanvas draws with Skia (native). Every test sees this stub;
// animation is checked on a simulator with the dev character gallery. The stub
// body lives in jest-mocks/CharacterCanvas.js (an inline factory trips
// babel-plugin-jest-hoist under NativeWind's Babel transform).
jest.mock('./src/components/characters/CharacterCanvas', () => require('./jest-mocks/CharacterCanvas'));

jest.mock('./src/auth/authClient', () => require('./jest-mocks/authClient'));

require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Recap export natives (spec 2026-10-04 §3). Tests set return values per case.
jest.mock('@shopify/react-native-skia', () => require('./jest-mocks/skia'));
jest.mock('expo-file-system', () => require('./jest-mocks/expoFileSystem'));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(() => Promise.resolve()), isAvailableAsync: jest.fn(() => Promise.resolve(true)) }));
// The legacy entry is the one the app imports: the package root's saveToLibraryAsync always throws.
jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));
