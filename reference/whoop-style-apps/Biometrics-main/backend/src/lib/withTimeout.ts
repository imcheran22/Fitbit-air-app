// The shared ioredis connection queues commands while Redis is down (maxRetriesPerRequest: null),
// so a call would wait forever. Every Redis call on a request path goes through this and takes its
// fallback when it fires. Extracted from achievements/marker.ts.

export function withTimeout<T>(p: Promise<T>, ms: number, message = 'timeout'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
