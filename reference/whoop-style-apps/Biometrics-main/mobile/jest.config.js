module.exports = {
  preset: 'jest-expo',
  resolver: 'react-native-worklets/jest/resolver',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', './jest-setup.js'],
};
