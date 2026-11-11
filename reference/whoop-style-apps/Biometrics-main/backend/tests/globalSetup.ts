import { purgeFixtureUsers } from './purgeFixtureUsers';

// Start every run from a clean slate: the previous run's fixture users are gone
// (the first run after this was added also clears the whole historical backlog).
export default async function globalSetup(): Promise<void> {
  await purgeFixtureUsers('start');
}
