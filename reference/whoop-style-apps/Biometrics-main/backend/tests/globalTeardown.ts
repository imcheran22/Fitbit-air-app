import { purgeFixtureUsers } from './purgeFixtureUsers';

// Leave the database clean at the end of a run too. The setup-time purge is the
// backstop for a run that never reaches this (a crash, a killed process).
export default async function globalTeardown(): Promise<void> {
  await purgeFixtureUsers('end');
}
