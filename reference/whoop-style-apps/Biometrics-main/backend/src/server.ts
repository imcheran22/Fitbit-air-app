import { createApp } from './app';
import { listenOrExit } from './listen';
import { startSyncWorker } from './sync/worker';
import { connection, syncQueue, enqueueImmediateTokenRefreshSweep, scheduleTokenRefreshSweep } from './sync/queue';
import { prisma } from './db/client';
import { installShutdownHandlers } from './shutdown';
import { scheduleNightlyScoreSweep } from './scoring/queue';
import { enqueuePendingStepsHistoryBackfills } from './sync/stepsHistory';
import { enqueuePendingSleepHistoryBackfills, enqueuePendingSleepStagesBackfills } from './sync/sleepHistory';
import { scheduleCatchUpSweep } from './sync/catchUp';
import { scheduleWeeklyHabitCorrelationSweep } from './habits/queue';
import { scheduleDailyCoachRetention } from './coach/queue';
import { startRecaps } from './recap/backfill';
import { startAchievements } from './achievements/launch';
import { coachSummaryQueue, startDaySummaryWorker } from './coach/daySummaryJob';
import { assertHandleHoldSecret } from './buddies/identity';

// Handle holds are keyed with HANDLE_HOLD_SECRET (buddies spec §2). Production must set it: the
// BETTER_AUTH_SECRET fallback is for development only, and rotating the secret releases every held
// handle. Throwing here stops the process before it binds the port.
assertHandleHoldSecret();

const port = Number(process.env.PORT ?? 3000);

// Queue workers and schedulers start only once the port is really bound. If
// another backend already owns it, this process must exit rather than run a
// second worker against the same queues while serving nothing (see listen.ts).
const server = listenOrExit(createApp(), port, {
  onListening: () => {
    console.log(`Backend listening on port ${port}`);
    startBackgroundWork();
  },
});

function startBackgroundWork(): void {
  const syncWorker = startSyncWorker();
  // Coach day summaries: their own queue and worker (COACH_SUMMARY_CONCURRENCY, default 1),
  // so model generations never take sync slots.
  const summaryWorker = startDaySummaryWorker();

  // Registered only once the port is bound and the workers exist, so a process
  // that exited because the port was taken never drains another one's queues.
  // Both workers drain before either queue (and then Redis) closes.
  installShutdownHandlers({
    server,
    worker: { close: async () => void (await Promise.all([syncWorker.close(), summaryWorker.close()])) },
    queue: { close: async () => void (await Promise.all([syncQueue.close(), coachSummaryQueue.close()])) },
    redis: connection,
    prisma,
  });

  // The sweep runs as a repeatable queue job, not a per-process setInterval, so
  // that running more than one backend instance does not have several of them
  // racing to refresh the same single-use Google Health refresh token.
  scheduleTokenRefreshSweep().catch((err) =>
    console.error('Failed to schedule the token refresh sweep', err),
  );
  enqueueImmediateTokenRefreshSweep().catch((err) =>
    console.error('Failed to enqueue the startup token refresh sweep', err),
  );

  // Backstop for webhooks: every 3 hours, catch every connected user up with
  // Google Health so scores and the coach see fresh data without the app open.
  scheduleCatchUpSweep().catch((err) =>
    console.error('Failed to schedule the catch-up sync sweep', err),
  );

  // Nightly backstop for the debounced per-webhook score recompute: catches
  // missed debounce windows and back-fills days with data but no score.
  scheduleNightlyScoreSweep().catch((err) =>
    console.error('Failed to schedule the nightly score sweep', err),
  );

  // Weekly habit/biometric correlation run. Weekly, not nightly: a pattern needs
  // new data between runs to be worth re-testing.
  scheduleWeeklyHabitCorrelationSweep().catch((err) =>
    console.error('Failed to schedule the weekly habit correlation sweep', err),
  );

  // Recaps replace the weekly digest: retire its scheduler, enqueue the one-off launch backfill,
  // then register the hourly recap sweep, in that order (spec 2026-10-04 §2).
  startRecaps().catch((err) => console.error('Failed to start the recap sweep', err));
  // Badges: the one-off launch job sets existing users' start dates (only where none is set) and
  // marks launch-day check-ins on time (spec 2026-10-06 §3). Never throws; retried next start.
  void startAchievements();
  // The daily 90-day transcript retention job (runs regardless of COACH_ENABLED).
  scheduleDailyCoachRetention().catch((err) =>
    console.error('Failed to schedule the daily coach retention job', err),
  );

  // A year of steps history for the activity heat map, for every connection
  // that does not have it yet (including ones made before it existed).
  enqueuePendingStepsHistoryBackfills().catch((err) =>
    console.error('Failed to enqueue pending steps history backfills', err),
  );
  // And a year of sleep history for its Sleep page.
  enqueuePendingSleepHistoryBackfills().catch((err) =>
    console.error('Failed to enqueue pending sleep history backfills', err),
  );
  // And, once, the sleep stages for history stored before they were captured.
  enqueuePendingSleepStagesBackfills().catch((err) =>
    console.error('Failed to enqueue pending sleep stages backfills', err),
  );
}
