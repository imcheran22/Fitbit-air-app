import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { buildRecoveryCalendar, buildRecoveryPage } from './bundle';

export const recoveryRouter = Router();

const ERRORS = {
  bad_date: 'date must be a valid YYYY-MM-DD or today',
  future_date: 'date is after today',
  bad_month: 'month must be YYYY-MM',
  future_month: 'month is after this month',
} as const;

// Registered before /:date so "calendar" is never read as a date.
recoveryRouter.get('/me/recovery/calendar/:month', requireAuth, async (req: AuthedRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const out = await buildRecoveryCalendar(req.userId!, String(req.params.month));
  if ('error' in out) {
    res.status(400).json({ error: ERRORS[out.error] });
    return;
  }
  res.json(out);
});

recoveryRouter.get('/me/recovery/:date', requireAuth, async (req: AuthedRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const out = await buildRecoveryPage(req.userId!, String(req.params.date));
  if ('error' in out) {
    res.status(400).json({ error: ERRORS[out.error] });
    return;
  }
  res.json(out);
});
