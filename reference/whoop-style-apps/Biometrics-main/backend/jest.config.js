module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Every DB-backed suite shares one Postgres test database (and one Redis).
  // Suites seed and delete rows for real, so parallel workers make results
  // order-dependent; run them serially.
  maxWorkers: 1,
  // The default 5s is too tight for suites that seed several rows against a
  // real database: on a loaded machine a full run takes ~2x longer, and a
  // seeding test then failed with "Exceeded timeout of 5000 ms" even though
  // nothing was wrong (it passed on the very next run). Several earlier
  // one-off failures in other DB suites fit the same pattern, though only
  // this one was captured with its error message.
  testTimeout: 20000,
  // Purge the "@example.com" fixture users every suite leaves behind, before
  // and after the run. Both are no-ops unless DATABASE_URL names a "_test"
  // database. There is no timeout on these hooks, which matters for the first
  // run after a long backlog has built up.
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
};
