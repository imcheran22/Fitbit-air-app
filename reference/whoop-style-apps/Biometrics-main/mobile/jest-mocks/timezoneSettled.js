// The real time zone module with its sign-in sync already settled: the badge store's first load
// waits (up to 3 s) for that sync, which only the navigator starts. For suites that render the
// real store: jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
module.exports = {
  ...jest.requireActual('../src/lib/timezone'),
  timezoneSynced: () => Promise.resolve(),
};
