import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { buildForecast } from './engine';
import { loadForecastData } from './load';

export const forecastRouter = Router();

// Tomorrow's Recovery forecast with the full what-if grid (spec section 2). Read-only.
forecastRouter.get('/me/forecast', requireAuth, async (req: AuthedRequest, res) => {
  const data = await loadForecastData(req.userId!, new Date());
  res.json(buildForecast(data));
});
