import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth, VERIFIED_URL, RESET_URL } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { AuthError } from '../../src/auth/authErrors';
import { clearWindDown } from '../../src/lib/windDown';

jest.mock('../../src/lib/windDown', () => ({ clearWindDown: jest.fn(async () => undefined) }));

const mocked = authClient as unknown as Record<string, any>;
let ctx: ReturnType<typeof useAuth>;
function Capture() {
  ctx = useAuth();
  return <Text testID="status">{ctx.session ? `in:${ctx.session.userId}` : 'out'}</Text>;
}
const renderAuth = () => render(<AuthProvider><Capture /></AuthProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.useSession.mockReturnValue({ data: null, isPending: false });
});

it('derives the session from authClient.useSession', () => {
  mocked.useSession.mockReturnValue({ data: { user: { id: 'u1', email: 'u1@example.com' }, session: {} }, isPending: false });
  expect(renderAuth().getByTestId('status').props.children).toBe('in:u1');
});

it('signs in with Apple, passing the first-sign-in name', async () => {
  renderAuth();
  await act(() => ctx.signInWithApple('apple-token', { givenName: 'Ada', familyName: 'Lovelace' }));
  expect(mocked.signIn.social).toHaveBeenCalledWith({
    provider: 'apple',
    idToken: { token: 'apple-token', user: { name: { firstName: 'Ada', lastName: 'Lovelace' } } },
  });
});

it('signs in with Google by ID token', async () => {
  renderAuth();
  await act(() => ctx.signInWithGoogle('gid'));
  expect(mocked.signIn.social).toHaveBeenCalledWith({ provider: 'google', idToken: { token: 'gid' } });
});

it('trims and lower-cases the email on sign-up and sign-in', async () => {
  renderAuth();
  await act(() => ctx.signUpWithEmail({ name: ' Pat ', email: ' Pat@Example.com ', password: 'pw123456' }));
  expect(mocked.signUp.email).toHaveBeenCalledWith({ name: 'Pat', email: 'pat@example.com', password: 'pw123456', callbackURL: VERIFIED_URL });
  await act(() => ctx.signInWithEmail('PAT@example.com ', 'pw123456'));
  expect(mocked.signIn.email).toHaveBeenCalledWith({ email: 'pat@example.com', password: 'pw123456' });
});

it('asks for a reset link that deep-links back into the app', async () => {
  renderAuth();
  await act(() => ctx.requestPasswordReset('pat@example.com'));
  expect(mocked.requestPasswordReset).toHaveBeenCalledWith({ email: 'pat@example.com', redirectTo: RESET_URL });
});

it('throws an AuthError when Better Auth reports one', async () => {
  mocked.signIn.email.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 } });
  renderAuth();
  await expect(ctx.signInWithEmail('a@example.com', 'x')).rejects.toBeInstanceOf(AuthError);
});

describe('session identity', () => {
  const sessionFor = (id: string) => ({ data: { user: { id, email: `${id}@example.com` }, session: {} }, isPending: false });
  let effectRuns: number;
  function SessionEffect() {
    const { session } = useAuth();
    React.useEffect(() => {
      effectRuns += 1;
    }, [session]);
    return null;
  }
  const tree = () => (
    <AuthProvider>
      <SessionEffect />
    </AuthProvider>
  );

  beforeEach(() => {
    effectRuns = 0;
  });

  it('keeps the same session when a refetch returns the same user', () => {
    mocked.useSession.mockReturnValue(sessionFor('u1'));
    const { rerender } = render(tree());
    mocked.useSession.mockReturnValue(sessionFor('u1'));
    rerender(tree());
    expect(effectRuns).toBe(1);
  });

  it('produces a new session when the user changes', () => {
    mocked.useSession.mockReturnValue(sessionFor('u1'));
    const { rerender } = render(tree());
    mocked.useSession.mockReturnValue(sessionFor('u2'));
    rerender(tree());
    expect(effectRuns).toBe(2);
  });
});

describe('wind-down reminder teardown', () => {
  it('cancels and clears the reminder on sign-out', async () => {
    renderAuth();
    await act(() => ctx.signOut());
    expect(clearWindDown).toHaveBeenCalledTimes(1);
  });

  it('cancels and clears the reminder on clearSession (account deletion)', async () => {
    renderAuth();
    await act(() => ctx.clearSession());
    expect(clearWindDown).toHaveBeenCalledTimes(1);
  });

  it('still signs out when clearing the reminder fails', async () => {
    (clearWindDown as jest.Mock).mockRejectedValueOnce(new Error('native'));
    renderAuth();
    // dropLocalSession swallows it: sign-out still completes.
    await act(() => ctx.signOut());
    expect(mocked.signOut).toHaveBeenCalled();
    expect(clearWindDown).toHaveBeenCalled();
  });
});
