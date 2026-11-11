import { getStateFromPath } from '@react-navigation/native';
import { authLinking } from '../../src/navigation/AuthNavigator';

it('maps the verify-email redirect to sign-in with the verified banner', () => {
  const state = getStateFromPath('verified', authLinking.config);
  expect(state?.routes[0]).toMatchObject({ name: 'SignIn', params: { verified: true } });
});

it('maps the reset redirect to the reset screen with its token', () => {
  const state = getStateFromPath('reset-password?token=abc', authLinking.config);
  expect(state?.routes[0]).toMatchObject({ name: 'ResetPassword', params: { token: 'abc' } });
});
