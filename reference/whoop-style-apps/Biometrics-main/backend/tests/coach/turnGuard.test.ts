import {
  RATE_LIMIT_MAX_TURNS,
  RATE_LIMIT_WINDOW_MS,
  TurnInProgressError,
  TurnRateLimitedError,
  resetTurnGuards,
  withTurnGuard,
} from '../../src/coach/turnGuard';

beforeEach(() => resetTurnGuards());

const never = () => new Promise<string>(() => undefined);

describe('coach turn guard', () => {
  it('runs a turn and returns its value', async () => {
    await expect(withTurnGuard('u1', async () => 'reply')).resolves.toBe('reply');
  });

  // A double-tap on a slow network used to start two turns for one
  // conversation: two replies, and two bills once a provider is wired.
  it('refuses a second turn while the first is still running', async () => {
    let release: (v: string) => void = () => undefined;
    const first = withTurnGuard('u1', () => new Promise<string>((r) => (release = r)));

    await expect(withTurnGuard('u1', async () => 'second')).rejects.toBeInstanceOf(TurnInProgressError);

    release('first');
    await expect(first).resolves.toBe('first');
  });

  it('lets the user start another turn once the first finishes', async () => {
    await withTurnGuard('u1', async () => 'one');
    await expect(withTurnGuard('u1', async () => 'two')).resolves.toBe('two');
  });

  // A wedged turn must not lock someone out of the coach until a restart.
  it('releases the lock when the turn throws', async () => {
    await expect(
      withTurnGuard('u1', async () => {
        throw new Error('model exploded');
      }),
    ).rejects.toThrow('model exploded');

    await expect(withTurnGuard('u1', async () => 'after')).resolves.toBe('after');
  });

  it('does not let one user block another', async () => {
    void withTurnGuard('u1', never);
    await expect(withTurnGuard('u2', async () => 'ok')).resolves.toBe('ok');
  });

  it('rate limits after the window allowance and reports when to retry', async () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_TURNS; i++) {
      await withTurnGuard('u1', async () => i, now + i);
    }

    const err = await withTurnGuard('u1', async () => 'blocked', now + RATE_LIMIT_MAX_TURNS).catch((e) => e);

    expect(err).toBeInstanceOf(TurnRateLimitedError);
    expect((err as TurnRateLimitedError).retryAfterSeconds).toBeGreaterThan(0);
    expect((err as TurnRateLimitedError).retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000);
  });

  it('forgets turns that have aged out of the window', async () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_TURNS; i++) {
      await withTurnGuard('u1', async () => i, now + i);
    }

    await expect(withTurnGuard('u1', async () => 'later', now + RATE_LIMIT_WINDOW_MS + 1)).resolves.toBe('later');
  });

  it('counts a turn on admission, so a long-running one still uses its slot', async () => {
    const now = 1_000_000;
    void withTurnGuard('u1', never, now);

    // Same user, so this is refused for being in flight rather than for the
    // rate limit -- but the in-flight turn has already been counted.
    await expect(withTurnGuard('u1', async () => 'x', now + 1)).rejects.toBeInstanceOf(TurnInProgressError);
  });
});
