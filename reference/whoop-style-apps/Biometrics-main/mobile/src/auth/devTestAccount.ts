// A local test account for development builds only, so signing in on the
// simulator doesn't mean retyping credentials (the Mac-to-simulator clipboard
// is unreliable). Set both in mobile/.env, which is gitignored:
//
//   EXPO_PUBLIC_DEV_SIGN_IN_EMAIL=demo@example.com
//   EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD=...
//
// Never available in a release build: __DEV__ is false there, so this returns
// null and the minifier drops the branch that reads the values.
export function devTestAccount(isDev: boolean = __DEV__): { email: string; password: string } | null {
  if (!isDev) return null;
  const email = process.env.EXPO_PUBLIC_DEV_SIGN_IN_EMAIL;
  const password = process.env.EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD;
  return email && password ? { email, password } : null;
}
