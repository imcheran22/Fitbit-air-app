import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { YourCoachRow } from '../../src/components/your-coach-row';

// Many screen tests stub @react-navigation/native without a NavigationContext.
// Profile (and so this row) must still render under such a stub.
jest.mock('@react-navigation/native', () => ({}));
// Synchronous icons: the real font load re-renders after this test finishes.
jest.mock('@expo/vector-icons', () => require('../../jest-mocks/vectorIcons'));

describe('YourCoachRow under a navigation stub without NavigationContext', () => {
  it('renders Mochi and ignores a press instead of throwing', () => {
    const { getByTestId } = render(<YourCoachRow />);

    const row = getByTestId('your-coach-row');
    expect(row).toHaveTextContent(/Mochi/);
    expect(() => fireEvent.press(row)).not.toThrow();
  });
});
