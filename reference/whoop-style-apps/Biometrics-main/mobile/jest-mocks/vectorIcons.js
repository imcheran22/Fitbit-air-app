// Jest stand-in for @expo/vector-icons, opted into per test file with
//   jest.mock('@expo/vector-icons', () => require('../../jest-mocks/vectorIcons'));
// The real icons load their font asynchronously and re-render when it arrives,
// which React reports as an update "not wrapped in act(...)" in tests that
// finish synchronously. This draws a plain, synchronous View that keeps the
// icon's name for any test that wants to look at it. Not global: snapshot tests
// (e.g. CorrelationCard) record the real icon's output.
// Lives in its own file for the same NativeWind/babel-plugin-jest-hoist reason
// as jest-mocks/CharacterCanvas.js.
const React = require('react');
const { View } = require('react-native');

function Ionicons({ name, size, color, style }) {
  return React.createElement(View, { iconName: name, iconSize: size, iconColor: color, style });
}
Ionicons.glyphMap = {};

module.exports = { Ionicons };
