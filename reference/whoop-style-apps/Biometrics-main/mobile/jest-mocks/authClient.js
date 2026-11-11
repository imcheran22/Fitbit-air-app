// Global mock of src/auth/authClient (registered in jest-setup.js). Kept in a
// file rather than an inline factory: inline factories trip
// babel-plugin-jest-hoist under NativeWind's Babel transform.
const ok = (data = {}) => jest.fn(async () => ({ data, error: null }));

const authClient = {
  useSession: jest.fn(() => ({ data: null, isPending: false, error: null })),
  getCookie: jest.fn(async () => 'biometrics.session_token=test'),
  signIn: { social: ok(), email: ok() },
  signUp: { email: ok() },
  signOut: ok(),
  sendVerificationEmail: ok(),
  requestPasswordReset: ok(),
  resetPassword: ok(),
  listAccounts: ok([]),
  linkSocial: ok(),
  unlinkAccount: ok(),
  listSessions: ok([]),
  revokeSession: ok(),
  revokeOtherSessions: ok(),
};

module.exports = { authClient, API_BASE_URL: 'http://localhost:3000' };
