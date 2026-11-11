import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemedStatusBar } from '../../src/components/themed-status-bar';

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));
jest.mock('expo-status-bar', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  return { StatusBar: ({ style }: { style: string }) => ReactLib.createElement(Text, { testID: 'status-bar' }, style) };
});

describe('ThemedStatusBar', () => {
  it('uses light content on the dark theme', () => {
    mockScheme = 'dark';
    expect(render(<ThemedStatusBar />).getByTestId('status-bar')).toHaveTextContent('light');
  });

  it('uses dark content on the light theme', () => {
    mockScheme = 'light';
    expect(render(<ThemedStatusBar />).getByTestId('status-bar')).toHaveTextContent('dark');
  });
});
