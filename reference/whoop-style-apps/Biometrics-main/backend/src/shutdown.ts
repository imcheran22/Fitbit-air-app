/**
 * Graceful shutdown for SIGTERM/SIGINT.
 *
 * Without this a deploy or a Ctrl-C killed the process mid-flight: in-progress
 * HTTP requests were cut off, and a sync job that had already fetched from
 * Google but not yet written its rows was abandoned rather than finished.
 *
 * Order matters. The HTTP server closes first so new requests stop arriving
 * while existing ones drain. The worker closes second: `worker.close()` waits
 * for the job it is running rather than dropping it. The queue, Redis
 * connection and Prisma pool close last, because the worker needs all three
 * while it drains.
 *
 * Everything is bounded by `timeoutMs`: a request that never ends, or a job
 * wedged on a slow Google call, must not hold a deploy open forever.
 */
export interface ShutdownDeps {
  server: { close(cb: (err?: Error) => void): unknown };
  worker: { close(): Promise<void> };
  queue: { close(): Promise<void> };
  redis: { quit(): Promise<unknown> };
  prisma: { $disconnect(): Promise<void> };
  /** Hard cap on the whole drain. Default 15s, comfortably under the usual 30s SIGKILL grace. */
  timeoutMs?: number;
  log?: (message: string) => void;
  exit?: (code: number) => void;
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

function closeServer(server: ShutdownDeps['server']): Promise<void> {
  // A close error is not actionable here -- the process is going away either
  // way -- so the callback's argument is deliberately ignored.
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function drain(deps: ShutdownDeps, log: (m: string) => void): Promise<void> {
  await closeServer(deps.server);
  log('HTTP server closed; draining the sync worker');
  await deps.worker.close();
  await deps.queue.close();
  await deps.redis.quit();
  await deps.prisma.$disconnect();
}

/** Runs the drain, bounded by `timeoutMs`. Resolves to the exit code to use. */
export async function shutdown(deps: ShutdownDeps): Promise<number> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
    // The timer must never be the reason the process stays alive.
    timer.unref?.();
  });

  try {
    const outcome = await Promise.race([drain(deps, log).then(() => 'done' as const), timedOut]);
    if (outcome === 'timeout') {
      log(`Shutdown still draining after ${timeoutMs}ms; exiting anyway`);
      return 1;
    }
    log('Shutdown complete');
    return 0;
  } catch (err) {
    log(`Shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Registers SIGTERM/SIGINT. A second signal while a drain is already running is
 * ignored rather than starting a second one: an impatient double Ctrl-C would
 * otherwise interrupt the very drain it was waiting for.
 */
export function installShutdownHandlers(deps: ShutdownDeps): void {
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const log = deps.log ?? ((m: string) => console.log(m));
  let running = false;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (running) {
        log(`Received ${signal} again; already shutting down`);
        return;
      }
      running = true;
      log(`Received ${signal}; shutting down gracefully`);
      void shutdown(deps).then(exit);
    });
  }
}
