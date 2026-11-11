// Better Auth client calls resolve to { data, error } instead of throwing.
// unwrap() turns that into the throw-on-failure style the rest of the app uses.

export class AuthError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;

  constructor(code: string | undefined, message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

type BetterAuthResult<T> = { data: T | null; error: { message?: string; code?: string; status?: number } | null };

export async function unwrap<T>(call: Promise<BetterAuthResult<T>>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new AuthError(error.code, error.message ?? 'Request failed', error.status);
  return data as T;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password do not match.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first. We sent you a link.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters for your password.',
  INVALID_TOKEN: 'This link has expired. Ask for a new one.',
  ACCOUNT_NOT_LINKED: 'An account with this email already exists. Sign in with your original method, then link this one in Settings.',
  FAILED_TO_UNLINK_LAST_ACCOUNT: 'You need at least one way to sign in.',
  LINKING_DIFFERENT_EMAILS_NOT_ALLOWED: "That account uses a different email, so it can't be linked. (Apple's Hide My Email addresses can't be linked either.)",
  SOCIAL_ACCOUNT_ALREADY_LINKED: 'That account is already linked to another Biometrics user.',
  // Defensive: the server sets freshAge to 0, so this should not occur.
  SESSION_NOT_FRESH: 'For your security, sign out and sign back in, then try again.',
};

export function messageFor(err: unknown): string {
  if (err instanceof AuthError && err.code && MESSAGES[err.code]) return MESSAGES[err.code]!;
  return 'Something went wrong. Please try again.';
}
