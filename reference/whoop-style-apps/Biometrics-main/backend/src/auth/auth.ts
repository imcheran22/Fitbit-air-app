import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { expo } from '@better-auth/expo';
import { prisma } from '../db/client';
import { defaultEmailSender, type EmailMessage, type EmailSender } from '../email/sender';
import { existingAccountEmail, resetPasswordEmail, verificationEmail } from '../email/templates';

export interface AuthDeps {
  email: EmailSender;
  /**
   * Test-only: replaces the Apple/Google ID-token signature check. The
   * providers still decode the token's claims (sub, email, email_verified).
   */
  verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// An email that fails to send must not turn into a response that differs by
// whether the address exists; log it and carry on.
async function sendQuietly(sender: EmailSender, message: EmailMessage): Promise<void> {
  try {
    await sender.send(message);
  } catch (err) {
    console.error(`Failed to send "${message.subject}": ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

export function createAuth(deps: AuthDeps) {
  const isProduction = process.env.NODE_ENV === 'production';
  const appleBundleId = requiredEnv('APPLE_BUNDLE_ID');
  const googleClientIds = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(
    (id): id is string => Boolean(id),
  );
  const idTokenOverride = deps.verifyIdToken ? { verifyIdToken: deps.verifyIdToken } : {};

  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    basePath: '/auth',
    secret: requiredEnv('BETTER_AUTH_SECRET'),
    baseURL: requiredEnv('BETTER_AUTH_URL'),
    advanced: { database: { generateId: 'uuid' } },
    trustedOrigins: ['biometrics://', ...(isProduction ? [] : ['exp://', 'exp://**'])],
    hooks: {
      // Better Auth lowercases email for case-insensitive matching but does
      // not trim surrounding whitespace, and its zod validator rejects an
      // email containing any. A phone keyboard's autocapitalize/autospace can
      // easily add both, so treat them the same as a normal address.
      before: createAuthMiddleware(async (ctx) => {
        if (typeof ctx.body?.email === 'string') {
          const email = ctx.body.email.trim();
          if (email !== ctx.body.email) return { context: { body: { ...ctx.body, email } } };
        }
      }),
    },
    socialProviders: {
      apple: {
        clientId: appleBundleId,
        appBundleIdentifier: appleBundleId,
        // Only the browser redirect flow uses a client secret; native
        // idToken sign-in never does.
        clientSecret: '',
        ...idTokenOverride,
      },
      google: {
        clientId: googleClientIds,
        ...idTokenOverride,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendQuietly(deps.email, resetPasswordEmail(user.email, url)),
      onExistingUserSignUp: async ({ user }) => sendQuietly(deps.email, existingAccountEmail(user.email)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => sendQuietly(deps.email, verificationEmail(user.email, url)),
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['apple', 'google'],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      // Freshness is off: freshAge counts from session creation, so 30-day sliding sessions would lock users out of Devices/Unlink. Last-method unlink and different-email linking stay blocked server-side.
      // WARNING: with freshAge 0 nothing is ever "stale", so enabling user.deleteUser or user.changeEmail later would leave them without a freshness check; add one before turning either on.
      freshAge: 0,
    },
    databaseHooks: {
      user: {
        create: {
          // User.name is required, but Apple only sends a name on the very
          // first sign-in and the user may hide it.
          before: async (user) => ({
            data: { ...user, name: user.name?.trim() || user.email.split('@')[0] || 'Biometrics user' },
          }),
        },
      },
    },
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = createAuth({ email: defaultEmailSender() });
