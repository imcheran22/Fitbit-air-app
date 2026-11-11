// Sets a new email/password credential on an existing account -- for a local
// test account whose password was forgotten. Changes nothing else: the user,
// their data and their sessions stay as they are (unlike seedDemoUser, which
// deletes and recreates the account).
//
//   NEW_PASSWORD=... npx ts-node scripts/setUserPassword.ts --email demo@example.com
//
// Refuses to run with NODE_ENV=production. Never runs on import.
import { auth } from '../src/auth/auth';
import { prisma } from '../src/db/client';

const MIN_LENGTH = 8;

export async function setUserPassword(email: string, password: string): Promise<{ userId: string }> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to change a password in production');
  if (password.length < MIN_LENGTH) throw new Error(`The password must be at least ${MIN_LENGTH} characters`);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);

  const ctx = await auth.$context;
  if (!(await ctx.internalAdapter.findCredentialAccount(user.id))) {
    throw new Error(`${email} has no email/password sign-in to change`);
  }
  await ctx.internalAdapter.updatePassword(user.id, await ctx.password.hash(password));
  return { userId: user.id };
}

async function main() {
  const i = process.argv.indexOf('--email');
  const email = i >= 0 ? process.argv[i + 1] : undefined;
  if (!email) throw new Error('Usage: NEW_PASSWORD=... setUserPassword --email <email>');
  const password = process.env.NEW_PASSWORD;
  if (!password) throw new Error('Set NEW_PASSWORD');
  try {
    await setUserPassword(email, password);
    console.log(`Password updated for ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
