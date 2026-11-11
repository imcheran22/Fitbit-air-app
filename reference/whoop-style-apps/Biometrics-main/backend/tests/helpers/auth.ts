import { randomUUID } from 'crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { testUtils } from 'better-auth/plugins';
import type { Express } from 'express';
import { prisma } from '../../src/db/client';
import { createApp } from '../../src/app';
import { createAuth } from '../../src/auth/auth';
import type { EmailMessage, EmailSender } from '../../src/email/sender';

// A test-only Better Auth instance with the testUtils plugin. It shares the
// secret and database with the app's instance, so a session it creates is
// accepted by requireAuth.
const testAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  basePath: '/auth',
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  advanced: { database: { generateId: 'uuid' } },
  plugins: [testUtils()],
});

/** A verified user with a unique @example.com email (purged by globalSetup/Teardown). */
export async function createTestUser(
  overrides: { email?: string; name?: string; emailVerified?: boolean; timezone?: string } = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Test User',
      emailVerified: overrides.emailVerified ?? true,
      ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
    },
  });
}

/** A real session for the user, as the header object supertest's .set() takes. */
export async function authHeaderFor(userId: string): Promise<{ Cookie: string }> {
  const ctx = await testAuth.$context;
  const { headers } = await ctx.test.login({ userId });
  const cookie = headers.get('cookie');
  if (!cookie) throw new Error('testUtils login returned no cookie');
  return { Cookie: cookie };
}

/** An unsigned JWT carrying the given claims; pair it with a verifyIdToken stub. */
export function fakeIdToken(claims: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'RS256', kid: 'test' })}.${b64({ iat: now, exp: now + 600, ...claims })}.sig`;
}

/** An EmailSender that records instead of sending. */
export function captureEmail(): EmailSender & { sent: EmailMessage[]; lastTo(to: string): EmailMessage | undefined } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
    lastTo(to) {
      return [...sent].reverse().find((m) => m.to === to);
    },
  };
}

/** The app wired to a Better Auth instance with stubbed ID-token checks and captured email. */
export function createTestApp(opts: { verifyIdToken?: (token: string) => Promise<boolean> } = {}): {
  app: Express;
  email: ReturnType<typeof captureEmail>;
} {
  const email = captureEmail();
  const auth = createAuth({ email, verifyIdToken: opts.verifyIdToken ?? (async () => true) });
  return { app: createApp({ auth }), email };
}

/** Pulls the first URL out of an email body. */
export function linkIn(message: EmailMessage | undefined): string {
  const match = message?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error('no link in email');
  return match[0];
}
