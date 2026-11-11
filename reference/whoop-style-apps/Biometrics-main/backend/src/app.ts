import express, { Express, type ErrorRequestHandler } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth as defaultAuth, type Auth } from './auth/auth';
import { healthRouter } from './health/routes';
import { biometricsRouter } from './biometrics/routes';
import { usersRouter } from './users/routes';
import { scoresRouter } from './scoring/routes';
import { recoveryRouter } from './recovery/routes';
import { forecastRouter } from './forecast/routes';
import { habitsRouter } from './habits/routes';
import { coachRouter } from './coach/routes';
import { syncRouter } from './sync/routes';
import { recapRouter } from './recap/routes';
import { achievementsRouter } from './achievements/routes';
import { buddiesRouter } from './buddies/routes';
import { socialRouter } from './social/routes';
import { chatsRouter } from './chats/routes';
import { kipRouter } from './kip/routes';

export function createApp(options: { auth?: Auth } = {}): Express {
  const app = express();
  // Better Auth reads the raw request body itself, so its handler must run
  // before express.json consumes it.
  app.all('/auth/*splat', toNodeHandler(options.auth ?? defaultAuth));
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.get('/health-check', (_req, res) => res.json({ status: 'ok' })); // renamed from /health to avoid clashing with the new /health/* route prefix
  app.use(healthRouter);
  app.use(biometricsRouter);
  app.use(syncRouter);
  app.use(usersRouter);
  app.use(scoresRouter);
  app.use(recoveryRouter);
  app.use(forecastRouter);
  app.use(habitsRouter);
  app.use(coachRouter);
  app.use(recapRouter);
  app.use(achievementsRouter);
  app.use(buddiesRouter);
  app.use(socialRouter);
  app.use(chatsRouter);
  app.use(kipRouter);
  app.use(lastErrorHandler);
  return app;
}

// The last error handler. Express's default one prints err.stack, and a body-parser SyntaxError quotes part of the
// request body, so free text (a camp note, a display name) could reach the logs. This one logs only the status and
// the error's type (body-parser's err.type, e.g. entity.parse.failed, else err.name): never its message, stack,
// body or anything from the request. Routes' own codes (BuddyError and the like) are answered before this runs.
// It never calls next(err): that reaches Express's default handler, which prints the stack. If the response has
// already started, it logs the same line and destroys the response (as Express's own handler does), so the client
// sees a broken response rather than a short one passed off as whole.
export const lastErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const e = (err ?? {}) as { status?: unknown; statusCode?: unknown; type?: unknown; name?: unknown };
  const raw = Number(e.status ?? e.statusCode ?? 500);
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  const type = typeof e.type === 'string' ? e.type : typeof e.name === 'string' ? e.name : 'unknown';
  console.error(JSON.stringify({ event: 'http.error', status, type }));
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(status).json({ error: status < 500 ? 'bad_request' : 'internal' });
};
