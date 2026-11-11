import type { Express } from 'express';
import type { Server } from 'http';

export interface ListenOptions {
  /** Runs once the port is actually bound -- never when binding failed. */
  onListening: () => void;
  /** Where a failure message goes. Defaults to console.error. */
  log?: (message: string, err: Error) => void;
  /** How the process ends on failure. Defaults to process.exit. */
  exit?: (code: number) => void;
}

export function describeListenError(err: NodeJS.ErrnoException, port: number): string {
  if (err.code === 'EADDRINUSE') {
    return (
      `Port ${port} is already in use, so this backend is NOT serving. ` +
      `Another backend is probably still running: find it with ` +
      `"lsof -nP -iTCP:${port} -sTCP:LISTEN", stop it, and start this one again.`
    );
  }
  if (err.code === 'EACCES') {
    return `Permission denied listening on port ${port}. Use a port above 1024 or run with the right privileges.`;
  }
  return `Failed to start the HTTP server on port ${port}: ${err.message}`;
}

/**
 * Listens on `port` and calls `onListening` only when that really succeeded.
 *
 * Express 5 hands a listen failure to the listen callback as its first
 * argument (application.js registers the callback as the server's 'error'
 * handler too). A callback that ignores it, as server.ts's used to, reports
 * "listening" for a server that never bound its port -- and the process stays
 * alive, because its queue workers keep the event loop busy, so a second
 * backend started by mistake looks healthy while serving nothing. Fail loudly
 * and exit instead.
 */
export function listenOrExit(app: Express, port: number, options: ListenOptions): Server {
  const log = options.log ?? ((message: string, err: Error) => console.error(message, err.message));
  const exit = options.exit ?? ((code: number) => process.exit(code));

  return app.listen(port, (err?: Error) => {
    if (err) {
      log(describeListenError(err, port), err);
      exit(1);
      return;
    }
    options.onListening();
  });
}
