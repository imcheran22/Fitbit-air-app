// backend/tests/coach/hostedConfig.test.ts
import {
  getHostedProvider,
  isHostedEngineAvailable,
  resetHostedProviderFromEnv,
} from '../../src/coach/config';
import { AnthropicProvider } from '../../src/coach/model/anthropic';

// Constructing the SDK client makes no network call, but keep it inert anyway.
jest.mock('@anthropic-ai/sdk');

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.COACH_HOSTED_ENABLED;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.COACH_HOSTED_MODEL;
  resetHostedProviderFromEnv();
});
afterAll(() => {
  process.env = saved;
  resetHostedProviderFromEnv();
});

describe('hosted engine availability', () => {
  it('is off by default', () => {
    expect(isHostedEngineAvailable()).toBe(false);
    expect(getHostedProvider()).toBeNull();
  });

  it('needs the flag AND a key', () => {
    process.env.COACH_HOSTED_ENABLED = 'true';
    expect(isHostedEngineAvailable()).toBe(false);

    process.env.COACH_HOSTED_ENABLED = 'false';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(isHostedEngineAvailable()).toBe(false);

    process.env.COACH_HOSTED_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = '  ';
    expect(isHostedEngineAvailable()).toBe(false);
  });

  it.each(['true', '1', ' TRUE '])('COACH_HOSTED_ENABLED=%j with a key offers an AnthropicProvider', (flag) => {
    process.env.COACH_HOSTED_ENABLED = flag;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(isHostedEngineAvailable()).toBe(true);
    expect(getHostedProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it('builds the provider once and re-reads the flag on every call', () => {
    process.env.COACH_HOSTED_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const first = getHostedProvider();
    expect(getHostedProvider()).toBe(first);
    process.env.COACH_HOSTED_ENABLED = 'false';
    expect(getHostedProvider()).toBeNull();
  });
});
