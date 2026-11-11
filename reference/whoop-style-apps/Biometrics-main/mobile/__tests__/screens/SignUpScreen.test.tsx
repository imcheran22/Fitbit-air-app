import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignUpScreen } from '../../src/screens/SignUpScreen';
import { useAuth } from '../../src/auth/AuthContext';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() } as any;

beforeEach(() => jest.clearAllMocks());

it('returns to the sign-in screen already in the stack instead of stacking a new one', async () => {
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail: jest.fn().mockResolvedValue(undefined) });
  const { getByTestId, findByTestId } = render(<SignUpScreen navigation={navigation} route={{} as any} />);
  fill(getByTestId);
  fireEvent.press(await findByTestId('back-to-sign-in'));
  expect(navigation.popTo).toHaveBeenCalledWith('SignIn');
  expect(navigation.navigate).not.toHaveBeenCalled();
});

function fill(getByTestId: (id: string) => any) {
  fireEvent.changeText(getByTestId('name-input'), 'Pat');
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('sign-up-button'));
}

it('shows "check your inbox" after sign-up (new or existing email look the same)', async () => {
  const signUpWithEmail = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail });
  const { getByTestId, findByRole } = render(<SignUpScreen navigation={navigation} route={{} as any} />);
  fill(getByTestId);
  await findByRole('header', { name: 'Check your inbox' });
  expect(signUpWithEmail).toHaveBeenCalledWith({ name: 'Pat', email: 'pat@example.com', password: 'pw123456' });
});

it('refuses a password shorter than 8 characters before calling the server', async () => {
  const signUpWithEmail = jest.fn();
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail });
  const { getByTestId, findByText } = render(<SignUpScreen navigation={navigation} route={{} as any} />);
  fireEvent.changeText(getByTestId('name-input'), 'Pat');
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'short');
  fireEvent.press(getByTestId('sign-up-button'));
  await findByText('Use at least 8 characters for your password.');
  expect(signUpWithEmail).not.toHaveBeenCalled();
});

it('always shows Mochi, whatever character a provider holds (signed-out screens)', () => {
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail: jest.fn() });
  const utils = render(withCharacter(<SignUpScreen navigation={navigation} route={{} as any} />, { characterId: 'kit' }));

  expect(characterLabel(utils, 'auth-character')).toBe('character:mochi:idle:56:playing:none');
});
