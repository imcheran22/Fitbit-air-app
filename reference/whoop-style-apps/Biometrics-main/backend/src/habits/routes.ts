import { Router } from 'express';
import type { HabitLog } from '@prisma/client';
import { clearAchievementsMarker } from '../achievements/marker';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { isCivilDate, shiftDate } from '../scoring/dates';
import { FACTOR_LABELS } from '../scoring/dto';
import { computeNotEnoughData } from './analysis';
import { CHECK_IN_BACKFILL_DAYS, HabitTypeConfig } from './config';
import { listConfirmedWithSeries } from './correlations';
import { CORRELATION_FACTORS, FactorKey } from './engine';
import { habitDayFor } from './habitDay';
import { listHabitTypes, newCustomTypeId } from './habitTypes';
import { buildObservedDays } from './observed';

export const habitsRouter = Router();

export const DEFAULT_STATUS_DAYS = 14;
export const MAX_STATUS_DAYS = 60;
export const DEFAULT_LOG_RANGE_DAYS = 30;
export const MAX_LOG_RANGE_DAYS = 366;
const MAX_LABEL_LENGTH = 40;
const MAX_UNIT_LENGTH = 20;
const MAX_NOTE_LENGTH = 500;
/** Client clocks drift; a log dated further ahead than this is a bug or garbage, not "later today". */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function userTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? 'UTC';
}

function toHabitTypeDTO(t: HabitTypeConfig) {
  return { type: t.type, label: t.label, unit: t.unit, exposureThreshold: t.exposureThreshold, builtIn: t.builtIn };
}

function toLogDTO(log: HabitLog) {
  return {
    id: log.id,
    habitType: log.habitType,
    value: log.value,
    unit: log.unit,
    loggedAt: log.loggedAt.toISOString(),
    habitDay: isoDay(log.habitDay),
    note: log.note,
  };
}

habitsRouter.get('/me/habits/config', requireAuth, async (req: AuthedRequest, res) => {
  const types = await listHabitTypes(req.userId!);
  res.json({ habitTypes: types.map(toHabitTypeDTO) });
});

habitsRouter.post('/me/habits/types', requireAuth, async (req: AuthedRequest, res) => {
  const { label: rawLabel, unit: rawUnit, exposureThreshold } = req.body ?? {};
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  const unit = typeof rawUnit === 'string' ? rawUnit.trim() : '';

  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    res.status(400).json({ error: `label must be 1-${MAX_LABEL_LENGTH} characters` });
    return;
  }
  if (unit.length === 0 || unit.length > MAX_UNIT_LENGTH) {
    res.status(400).json({ error: `unit must be 1-${MAX_UNIT_LENGTH} characters` });
    return;
  }
  // > 0, not >= 0: a threshold of 0 would make every observed day "exposed".
  if (typeof exposureThreshold !== 'number' || !Number.isFinite(exposureThreshold) || exposureThreshold <= 0) {
    res.status(400).json({ error: 'exposureThreshold must be a positive number' });
    return;
  }

  const userId = req.userId!;
  const existing = await listHabitTypes(userId);
  if (existing.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
    res.status(409).json({ error: `A habit named "${label}" already exists` });
    return;
  }

  const created = await prisma.habitType.create({
    data: { userId, type: newCustomTypeId(label), label, unit, exposureThreshold },
  });
  res.status(201).json({
    habitType: toHabitTypeDTO({
      type: created.type,
      label: created.label,
      unit: created.unit,
      exposureThreshold: created.exposureThreshold,
      builtIn: false,
    }),
  });
});

habitsRouter.post('/me/habits/logs', requireAuth, async (req: AuthedRequest, res) => {
  const { habitType, value, unit, note, loggedAt: rawLoggedAt } = req.body ?? {};
  const userId = req.userId!;

  if (typeof habitType !== 'string') {
    res.status(400).json({ error: 'habitType is required' });
    return;
  }
  const type = (await listHabitTypes(userId)).find((t) => t.type === habitType);
  if (!type) {
    res.status(400).json({ error: `Unknown habit type "${habitType}"` });
    return;
  }
  // 0 is valid and meaningful ("none"); negative, NaN and Infinity are not.
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    res.status(400).json({ error: 'value must be a finite number >= 0' });
    return;
  }
  if (unit !== undefined && (typeof unit !== 'string' || unit.trim().length === 0 || unit.length > MAX_UNIT_LENGTH)) {
    res.status(400).json({ error: `unit must be a non-empty string of at most ${MAX_UNIT_LENGTH} characters` });
    return;
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
    res.status(400).json({ error: `note must be a string of at most ${MAX_NOTE_LENGTH} characters` });
    return;
  }

  const now = new Date();
  let loggedAt = now;
  if (rawLoggedAt !== undefined) {
    loggedAt = new Date(rawLoggedAt);
    if (typeof rawLoggedAt !== 'string' || Number.isNaN(loggedAt.getTime())) {
      res.status(400).json({ error: 'loggedAt must be an ISO timestamp' });
      return;
    }
    if (loggedAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
      res.status(400).json({ error: 'loggedAt cannot be in the future' });
      return;
    }
  }

  // Derived once, with the timezone in effect NOW, and stored: a later change
  // to User.timezone must not move old logs to different habit days.
  const habitDay = habitDayFor(loggedAt, await userTimezone(userId));
  const log = await prisma.habitLog.create({
    data: {
      userId,
      habitType,
      value,
      unit: typeof unit === 'string' ? unit.trim() : type.unit,
      loggedAt,
      habitDay: civilDateToUtcMidnight(habitDay),
      note: typeof note === 'string' && note.length > 0 ? note : null,
    },
  });
  res.status(201).json({ log: toLogDTO(log) });
});

habitsRouter.get('/me/habits/logs', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { from: rawFrom, to: rawTo } = req.query;
  if ((rawFrom !== undefined && !isCivilDate(rawFrom)) || (rawTo !== undefined && !isCivilDate(rawTo))) {
    res.status(400).json({ error: 'from and to must be valid YYYY-MM-DD habit days' });
    return;
  }

  const today = habitDayFor(new Date(), await userTimezone(userId));
  const to = (rawTo as string | undefined) ?? today;
  const from = (rawFrom as string | undefined) ?? shiftDate(to, -(DEFAULT_LOG_RANGE_DAYS - 1));
  if (from > to) {
    res.status(400).json({ error: 'from must not be after to' });
    return;
  }
  if (shiftDate(from, MAX_LOG_RANGE_DAYS) < to) {
    res.status(400).json({ error: `range is limited to ${MAX_LOG_RANGE_DAYS} days` });
    return;
  }

  const logs = await prisma.habitLog.findMany({
    where: { userId, habitDay: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(to) } },
    orderBy: [{ habitDay: 'desc' }, { loggedAt: 'desc' }],
  });
  res.json({ logs: logs.map(toLogDTO) });
});

habitsRouter.delete('/me/habits/logs/:id', requireAuth, async (req: AuthedRequest, res) => {
  // Scoped by userId in the same query, so another user's log id is
  // indistinguishable from a nonexistent one (404, never 403).
  const result = await prisma.habitLog.deleteMany({ where: { id: String(req.params.id), userId: req.userId! } });
  if (result.count === 0) {
    res.status(404).json({ error: 'Habit log not found' });
    return;
  }
  res.status(204).end();
});

habitsRouter.post('/me/habits/check-ins', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const today = habitDayFor(new Date(), await userTimezone(userId));
  const requested: unknown = req.body?.habitDay;

  let habitDay = today;
  if (requested !== undefined) {
    if (!isCivilDate(requested)) {
      res.status(400).json({ error: 'habitDay must be a valid YYYY-MM-DD' });
      return;
    }
    habitDay = requested;
  }
  // Today and the previous 7 habit days: far enough to catch up after a
  // missed evening, not so far that history can be rewritten wholesale (or
  // the future pre-declared as "nothing").
  if (habitDay > today || habitDay < shiftDate(today, -CHECK_IN_BACKFILL_DAYS)) {
    res.status(400).json({ error: `habitDay must be today or within the previous ${CHECK_IN_BACKFILL_DAYS} days` });
    return;
  }

  const day = civilDateToUtcMidnight(habitDay);
  // On time = made during its own habit day (achievements spec §3). Stored when the row is written
  // and never recomputed: a second tap changes nothing, the flag included.
  const onTime = habitDay === today;
  await prisma.habitCheckIn.upsert({
    where: { userId_habitDay: { userId, habitDay: day } },
    update: {},
    create: { userId, habitDay: day, onTime },
  });
  // A check-in can extend the check-in streak: the next badge load re-evaluates at once.
  await clearAchievementsMarker(userId);
  res.status(201).json({ checkIn: { habitDay } });
});

habitsRouter.get('/me/habits/status', requireAuth, async (req: AuthedRequest, res) => {
  let days = DEFAULT_STATUS_DAYS;
  if (req.query.days !== undefined) {
    days = Number(req.query.days);
    if (!Number.isInteger(days) || days < 1) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    days = Math.min(days, MAX_STATUS_DAYS);
  }

  const userId = req.userId!;
  const today = habitDayFor(new Date(), await userTimezone(userId));
  const oldest = shiftDate(today, -(days - 1));
  const window = { gte: civilDateToUtcMidnight(oldest), lte: civilDateToUtcMidnight(today) };

  const [types, logs, checkIns] = await Promise.all([
    listHabitTypes(userId),
    prisma.habitLog.findMany({ where: { userId, habitDay: window }, select: { habitType: true, value: true, habitDay: true } }),
    prisma.habitCheckIn.findMany({ where: { userId, habitDay: window }, select: { habitDay: true } }),
  ]);
  const checkedIn = new Set(checkIns.map((c) => isoDay(c.habitDay)));
  const observed = buildObservedDays(
    logs.map((l) => ({ habitType: l.habitType, value: l.value, habitDay: isoDay(l.habitDay) })),
    [...checkedIn],
    types,
  );
  const observedSets = new Map([...observed].map(([type, list]) => [type, new Set(list.map((d) => d.day))]));

  const out = [];
  for (let i = 0; i < days; i++) {
    const habitDay = shiftDate(today, -i);
    out.push({
      habitDay,
      checkedIn: checkedIn.has(habitDay),
      observed: Object.fromEntries(types.map((t) => [t.type, observedSets.get(t.type)?.has(habitDay) ?? false])),
    });
  }
  res.json({ today, days: out });
});

habitsRouter.get('/me/habits/patterns', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  // Patterns are the stored CONFIRMED rows (weekly lifecycle); the "N of 8 needed" counts are the one
  // live part, computed by the pair-counting gate alone: no statistical test runs on a read.
  const [confirmed, notEnoughData] = await Promise.all([listConfirmedWithSeries(userId), computeNotEnoughData(userId, new Date())]);

  res.json({
    // CONFIRMED only: candidates are never shown.
    patterns: confirmed
      .filter((c) => (CORRELATION_FACTORS as readonly string[]).includes(c.factor))
      .map((c) => ({
        habitType: c.habitType,
        exposureThreshold: c.exposureThreshold,
        exposureUnit: c.exposureUnit,
        factor: c.factor,
        factorLabel: FACTOR_LABELS[c.factor as FactorKey],
        lagDays: c.lagDays,
        effectSizePercent: c.effectSizePercent,
        comparisonPercent: c.comparisonPercent,
        sampleSize: c.sampleSize,
        direction: c.direction,
        series: c.series,
      })),
    notEnoughData,
  });
});
