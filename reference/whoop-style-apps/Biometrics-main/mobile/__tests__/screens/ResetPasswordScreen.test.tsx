import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ResetPasswordScreen } from '../../src/screens/ResetPasswordScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { AuthError } from '../../src/auth/authErrors';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const navigation = { navigate: jest.fn(), popTo: jest.fn() } as any;

beforeEach(() => jest.clearAllMocks());

it('resets with the token from the deep link and returns to sign-in', async () => {
  const resetPassword = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ resetPassword });
  const { getByTestId } = render(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'tok' } } as any} />);
  fireEvent.changeText(getByTestId('password-input'), 'new password 1');
  fireEvent.press(getByTestId('reset-password-button'));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('tok', 'new password 1'));
  // Back to the sign-in screen already in the stack, not a second copy of it.
  expect(navigation.popTo).toHaveBeenCalledWith('SignIn');
  expect(navigation.navigate).not.toHaveBeenCalled();
});

it('explains an expired link', async () => {
  (useAuth as jest.Mock).mockReturnValue({ resetPassword: jest.fn().mockRejectedValue(new AuthError('INVALID_TOKEN', 'x', 400)) });
  const { getByTestId, findByText } = render(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'old' } } as any} />);
  fireEvent.changeText(getByTestId('password-input'), 'new password 1');
  fireEvent.press(getByTestId('reset-password-button'));
  await findByText('This link has expired. Ask for a new one.');
});

it('without a token, sends the user to ask for a new link', () => {
  (useAuth as jest.Mock).mockReturnValue({ resetPassword: jest.fn() });
  const { getByText } = render(<ResetPasswordScreen navigation={navigation} route={{ params: undefined } as any} />);
  expect(getByText('This link has expired. Ask for a new one.')).toBeTruthy();
});

// Warm app: a fresh reset link updates the params of the reset screen that is
// already open, rather than mounting a new one.
it('picks up a fresh token that arrives on an already-open reset screen', async () => {
  const resetPassword = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ resetPassword });
  const { queryByTestId, queryByText, getByTestId, rerender } = render(
    <ResetPasswordScreen navigation={navigation} route={{ params: undefined } as any} />,
  );
  expect(queryByTestId('password-input')).toBeNull();
  rerender(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'fresh' } } as any} />);
  expect(queryByText('This link has expired. Ask for a new one.')).toBeNull();
  fireEvent.changeText(getByTestId('password-input'), 'new password 1');
  fireEvent.press(getByTestId('reset-password-button'));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('fresh', 'new password 1'));
});

it('always shows Mochi, whatever character a provider holds (signed-out screens)', () => {
  (useAuth as jest.Mock).mockReturnValue({ resetPassword: jest.fn() });
  const utils = render(withCharacter(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'tok' } } as any} />, { characterId: 'kit' }));

  expect(characterLabel(utils, 'auth-character')).toBe('character:mochi:idle:56:playing:none');
});
