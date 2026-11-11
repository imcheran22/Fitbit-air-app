// The demo account: replaces any existing user with this email, then creates a
// verified Better Auth user with an email/password credential. Auth I/O only.
// An existing user with a health connection is a real account (a demo user never
// has one), so it is only replaced when `force` is set: a mistyped email must not
// revoke someone's Google grant and delete their data.
import { auth } from '../auth/auth';
import { prisma } from '../db/client';
import { deleteUserAccount } from '../users/deletion';

export async function createDemoAccount(
  email: string,
  password: string,
  { force = false }: { force?: boolean } = {},
): Promise<{ userId: string }> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, healthConnection: { select: { id: true } } },
  });
  if (existing?.healthConnection && !force) {
    throw new Error(`Refusing to replace ${email}: it has a health connection, so it looks like a real account. Pass --force to replace it anyway.`);
  }
  if (existing) await deleteUserAccount(existing.id);

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email, name: 'Demo User', emailVerified: true },
    { method: 'email-password' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  await prisma.user.update({ where: { id: user.id }, data: { timezone: 'UTC' } });
  return { userId: user.id };
}
