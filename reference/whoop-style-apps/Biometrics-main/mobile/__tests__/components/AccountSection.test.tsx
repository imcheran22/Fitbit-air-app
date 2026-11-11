import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { AccountSection } from '../../src/components/account-section';
import { useOptionalAuth } from '../../src/auth/AuthContext';

jest.mock('../../src/auth/AuthContext', () => ({ useOptionalAuth: jest.fn() }));

beforeEach(() => {
  (useOptionalAuth as jest.Mock).mockReturnValue(undefined);
});

it('opens the sign-in methods and devices screens', () => {
  const navigate = jest.fn();
  const { getByTestId } = render(
    <NavigationContext.Provider value={{ navigate } as any}>
      <AccountSection />
    </NavigationContext.Provider>,
  );
  fireEvent.press(getByTestId('sign-in-methods-row'));
  fireEvent.press(getByTestId('devices-row'));
  expect(navigate.mock.calls.map((c) => c[0])).toEqual(['SignInMethods', 'Devices']);
});

it('renders without a navigator (Settings is rendered in isolation in tests)', () => {
  expect(() => render(<AccountSection />)).not.toThrow();
});

it('signs out from the account section', () => {
  const signOut = jest.fn();
  (useOptionalAuth as jest.Mock).mockReturnValue({ session: { userId: 'u1', email: 'u1@example.com' }, signOut });
  const { getByTestId } = render(<AccountSection />);
  fireEvent.press(getByTestId('sign-out-button'));
  expect(signOut).toHaveBeenCalled();
});

it('has no sign-out row outside an AuthProvider', () => {
  const { queryByTestId } = render(<AccountSection />);
  expect(queryByTestId('sign-out-button')).toBeNull();
});
