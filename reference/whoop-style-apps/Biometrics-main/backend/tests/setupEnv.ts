// Loaded by Jest before any test module (jest.config.js `setupFiles`), because
// the default Better Auth instance reads these when src/auth/auth.ts is first
// imported.
process.env.BETTER_AUTH_SECRET ??= 'test-better-auth-secret-at-least-32-chars';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.APPLE_BUNDLE_ID ??= 'com.tusharcora.biometrics';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
