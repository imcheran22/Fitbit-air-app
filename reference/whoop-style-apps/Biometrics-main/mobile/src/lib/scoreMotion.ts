import { MOTION } from '../theme';

export interface FactorPoints {
  factor: string;
  points: number;
}

export function pointsByFactor(factors: FactorPoints[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const f of factors) map[f.factor] = f.points;
  return map;
}

// The factor that moved the most animates first, so the eye is drawn to WHY
// the score changed, not just that it did (spec 5). A missing previous state --
// first paint, or a factor that wasn't there before -- counts as zero points,
// so first paint orders by |points|. Ties keep the incoming factor order.
export function staggerOrder(prev: Record<string, number> | undefined, next: FactorPoints[]): string[] {
  return next
    .map((f, index) => ({ factor: f.factor, index, delta: Math.abs(f.points - (prev?.[f.factor] ?? 0)) }))
    .sort((a, b) => b.delta - a.delta || a.index - b.index)
    .map((entry) => entry.factor);
}

// Delay in ms per factor: rank 0 starts immediately, each later rank waits one
// more step. The step is a MOTION token, never an inline number.
export function staggerDelays(
  prev: Record<string, number> | undefined,
  next: FactorPoints[],
  stepMs: number = MOTION.duration.fast,
): Record<string, number> {
  const delays: Record<string, number> = {};
  staggerOrder(prev, next).forEach((factor, rank) => {
    delays[factor] = rank * stepMs;
  });
  return delays;
}
