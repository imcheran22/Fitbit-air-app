// Creates (or recreates) a showcase account with 90 days of synthetic history,
// then runs the REAL scoring and habit pipelines over it (spec section 4).
//
//   DEMO_USER_PASSWORD=... npx ts-node scripts/seedDemoUser.ts --email demo@example.com [--seed 1] [--force]
//
// Writes only raw inputs; never DailyScore, UserDailyFeatures or HabitCorrelation.
// Refuses to run with NODE_ENV=production, or to replace an existing account that
// has a health connection, unless --force.
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { createDemoAccount } from '../src/demo/account';
import { generateDemoHistory } from '../src/demo/generate';
import { writeDemoHistory } from '../src/demo/persist';
import { runHabitCorrelations } from '../src/habits/job';
import { rescoreUser } from './rescoreUser';

const DAYS = 90;
const WEEK_MS = 7 * 86_400_000;

export async function seedDemoUser({
  email,
  password,
  seed = 1,
  now = new Date(),
  force = false,
}: { email: string; password: string; seed?: number; now?: Date; force?: boolean }): Promise<{ userId: string }> {
  if (process.env.NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to seed a demo user in production without --force');
  }

  const { userId } = await createDemoAccount(email, password, { force });
  const today = now.toISOString().slice(0, 10);
  await writeDemoHistory(userId, generateDemoHistory({ seed, endDate: today, days: DAYS }));

  await rescoreUser(userId, { days: DAYS, now });
  // CONFIRMED needs two consecutive weekly passes; replay three weeks, as the weekly job would have.
  for (const weeksAgo of [2, 1, 0]) {
    await runHabitCorrelations(userId, { now: new Date(now.getTime() - weeksAgo * WEEK_MS) });
  }
  return { userId };
}

export function parseArgs(argv: string[]): { email: string; seed: number; force: boolean } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const email = get('--email');
  if (!email) throw new Error('Usage: seedDemoUser --email <email> [--seed N] [--force]');
  const seed = Number(get('--seed') ?? 1);
  if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer, got ${get('--seed')}`);
  return { email, seed, force: argv.includes('--force') };
}

async function main() {
  const { email, seed, force } = parseArgs(process.argv.slice(2));
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error('Set DEMO_USER_PASSWORD');
  try {
    const { userId } = await seedDemoUser({ email, password, seed, force });
    console.log(`Seeded demo user ${email} (${userId})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
