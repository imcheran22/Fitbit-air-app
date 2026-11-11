import { shutdown, DEFAULT_SHUTDOWN_TIMEOUT_MS } from '../src/shutdown';

function deps(over: Partial<Parameters<typeof shutdown>[0]> = {}) {
  const order: string[] = [];
  const base = {
    server: {
      close: (cb: (err?: Error) => void) => {
        order.push('server');
        cb();
      },
    },
    worker: {
      close: async () => {
        order.push('worker');
      },
    },
    queue: {
      close: async () => {
        order.push('queue');
      },
    },
    redis: {
      quit: async () => {
        order.push('redis');
        return 'OK';
      },
    },
    prisma: {
      $disconnect: async () => {
        order.push('prisma');
      },
    },
    log: () => undefined,
  };
  return { order, deps: { ...base, ...over } as Parameters<typeof shutdown>[0] };
}

describe('graceful shutdown', () => {
  it('closes the HTTP server before draining the worker, then the queue, Redis and Prisma', async () => {
    const { order, deps: d } = deps();

    const code = await shutdown(d);

    expect(code).toBe(0);
    expect(order).toEqual(['server', 'worker', 'queue', 'redis', 'prisma']);
  });

  // The whole point is to let an in-flight job finish, so the worker must not
  // be closed while requests are still draining.
  it('waits for the server to finish closing before touching the worker', async () => {
    const { order, deps: d } = deps({
      server: {
        close: (cb: (err?: Error) => void) => {
          setTimeout(() => {
            order.push('server');
            cb();
          }, 20);
        },
      },
    });

    await shutdown(d);

    expect(order[0]).toBe('server');
    expect(order[1]).toBe('worker');
  });

  it('gives up and reports a non-zero code when a drain hangs past the timeout', async () => {
    const { order, deps: d } = deps({
      worker: { close: () => new Promise<void>(() => undefined) },
      timeoutMs: 30,
    });

    const code = await shutdown(d);

    expect(code).toBe(1);
    // Redis and Prisma never got their turn, which is exactly why the timeout exists.
    expect(order).toEqual(['server']);
  });

  it('reports a non-zero code when a close throws rather than rejecting the caller', async () => {
    const { deps: d } = deps({
      queue: {
        close: async () => {
          throw new Error('redis gone');
        },
      },
    });

    await expect(shutdown(d)).resolves.toBe(1);
  });

  it('defaults to a timeout under the usual 30s SIGKILL grace period', () => {
    expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
