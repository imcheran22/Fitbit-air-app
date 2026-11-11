import { devTestAccount } from '../../src/auth/devTestAccount';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function setAccount(email?: string, password?: string) {
  if (email === undefined) delete process.env.EXPO_PUBLIC_DEV_SIGN_IN_EMAIL;
  else process.env.EXPO_PUBLIC_DEV_SIGN_IN_EMAIL = email;
  if (password === undefined) delete process.env.EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD;
  else process.env.EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD = password;
}

describe('devTestAccount', () => {
  it('is read from the environment in a development build', () => {
    setAccount('demo@example.com', 'secret');
    expect(devTestAccount(true)).toEqual({ email: 'demo@example.com', password: 'secret' });
  });

  it('is never available in a release build', () => {
    setAccount('demo@example.com', 'secret');
    expect(devTestAccount(false)).toBeNull();
  });

  it('needs both the email and the password', () => {
    setAccount('demo@example.com', undefined);
    expect(devTestAccount(true)).toBeNull();
  });
});
