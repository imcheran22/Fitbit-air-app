// Stage 4 -- Composite score. Pure.
//
//   score = 100 / (1 + e^(-k * sum(w_i * z_i)))
//
// over direction-corrected z-scores, with the weights renormalized each day
// around any factor that is excluded.

import type { ScoreConfig } from './configs/v1';
import type { CompositeResult, ConfidenceLevel, FactorContribution, FactorInput, FactorKey } from './types';

/** The per-factor weights and directions of one score type. The config itself is the Recovery model. */
export interface CompositeModel {
  weights: Partial<Record<FactorKey, number>>;
  direction: Partial<Record<FactorKey, 1 | -1>>;
}

/** Logistic squashing into (0, 100): a zero weighted sum is 50, and k sets how fast it saturates. */
export function logistic(weightedSum: number, k: number): number {
  return 100 / (1 + Math.exp(-k * weightedSum));
}

/** Clamp `z` to cfg.zClamp; a config without one leaves it untouched. */
function clampZ(z: number, cfg: ScoreConfig): number {
  return cfg.zClamp ? Math.min(cfg.zClamp.max, Math.max(cfg.zClamp.min, z)) : z;
}

const LEVELS: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW'];

/**
 * Confidence starts HIGH and drops one level for imputation (however many
 * inputs were imputed: it is one kind of weakness), one for renormalizing
 * around an excluded factor, and one more when two or more are excluded --
 * a score resting on a single factor is LOW however clean that factor is.
 */
function confidenceFor(inputs: FactorInput[]): ConfidenceLevel {
  const excludedCount = inputs.filter((f) => f.excluded).length;
  const anyImputed = inputs.some((f) => f.imputed && !f.excluded);
  const drops = (anyImputed ? 1 : 0) + (excludedCount >= 1 ? 1 : 0) + (excludedCount >= 2 ? 1 : 0);
  return LEVELS[Math.min(drops, LEVELS.length - 1)]!;
}

/**
 * `model` picks which score is being computed: it defaults to the Recovery
 * weights on `cfg`, and the Sleep Score passes `cfg.sleepScore`. Everything else
 * (k, the logistic, renormalization, confidence) is shared.
 *
 * Under a config with a zClamp every factor's z is clamped BEFORE weighting (and
 * so before it can influence anything else), the clamped z is what is stored and
 * summed (contribution = weight * direction * z stays exactly true), and the
 * unclamped one is kept as `zRaw`. Exclusion and renormalization depend only on
 * whether a z exists, never its size, so the weights still sum to 1.
 */
export function computeComposite(
  inputs: FactorInput[],
  cfg: ScoreConfig,
  model: CompositeModel = cfg,
): CompositeResult {
  const active = inputs.filter((f) => !f.excluded && f.z !== null);
  // Weights are renormalized over the factors actually present, so a day with a
  // cold-starting factor is not scored against a sub-1 weight sum (which would
  // understate the composite for reasons unrelated to recovery).
  const totalWeight = active.reduce((sum, f) => sum + model.weights[f.factor]!, 0);

  const factors: FactorContribution[] = inputs.map((f) => {
    const goal = f.goalMinutes !== undefined ? { goalMinutes: f.goalMinutes } : {};
    if (f.excluded || f.z === null) {
      return { factor: f.factor, z: null, ...goal, weight: 0, contribution: 0, imputed: false, excluded: true };
    }
    const weight = model.weights[f.factor]! / totalWeight;
    const z = clampZ(f.z, cfg);
    return {
      factor: f.factor,
      z,
      ...(cfg.zClamp ? { zRaw: f.zRaw ?? f.z } : {}),
      ...goal,
      weight,
      contribution: weight * model.direction[f.factor]! * z,
      imputed: f.imputed,
      excluded: false,
    };
  });

  const confidenceLevel = confidenceFor(inputs);
  if (active.length === 0) return { score: null, confidenceLevel: 'LOW', factors };

  const weightedSum = factors.reduce((sum, f) => sum + f.contribution, 0);
  return { score: logistic(weightedSum, cfg.k), confidenceLevel, factors };
}
