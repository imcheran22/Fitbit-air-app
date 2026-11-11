// Jest stand-in for src/components/characters/CharacterCanvas (see jest-setup.js).
// Lives in its own file because NativeWind's Babel transform trips
// babel-plugin-jest-hoist inside an inline jest.mock() factory.
const React = require('react');
const { View } = require('react-native');

module.exports = {
  CharacterCanvas: ({ characterId, mood, size, paused, attachment }) =>
    React.createElement(View, {
      testID: 'character-canvas',
      accessibilityLabel: `character:${characterId}:${mood}:${size}:${paused ? 'paused' : 'playing'}:${attachment ?? 'none'}`,
    }),
};
