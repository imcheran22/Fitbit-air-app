// better-auth is ESM-only. The backend is CommonJS, so it loads through Node
// 24's require(esm); under Jest that needs --experimental-vm-modules (set in the
// npm test script). This test fails first if either is missing.
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { expo } from '@better-auth/expo';

it('loads better-auth and the expo server plugin', () => {
  expect(typeof betterAuth).toBe('function');
  expect(typeof toNodeHandler).toBe('function');
  expect(typeof expo).toBe('function');
});
