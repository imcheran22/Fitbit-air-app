package com.apex.athlete.core.analytics

/**
 * Version of the formulas in this module. Stored next to every derived value so that scores
 * computed with an older formula set can be found and recomputed after an upgrade.
 * Bump whenever a formula or default constant changes; record the change in docs/FORMULAS.md.
 *
 * History:
 * - 1: initial formula set.
 * - 2: science review (docs/AUDIT.md, "Formula review"). Training-load EWMAs use normalised
 *   weights instead of seeding with the first day; the HRV 7-day average is taken on the
 *   ln scale; the weekly-HRV fatigue signal needs 3 readings in the last 7 days; week-over-week
 *   load change needs 5 recorded days in both weeks; non-finite inputs count as missing;
 *   remaining-capacity minutes use the engine's own zone method and reserve floor.
 * - 3: metric-definition review (docs/review/METRICS_ALIGNMENT.md B1-B12, BEVEL_ALIGNMENT.md,
 *   docs/DECISIONS.md D8). Recovery: breathing, temperature and workload ratio are additive
 *   penalties, not part of the weighted mean; a caveated ratio is not used. Load: partly worn
 *   days (< 600 recorded minutes) and today stay out, first duplicate wins, the coupled ratio needs
 *   14 recorded days, density/recency confidence below 0.35 withholds the ratios. TRIMP anchors on
 *   the resting-HR baseline; one resting series per window. Observed HRmax is the 99.5th percentile
 *   of >= 600 active minutes. Fatigue is "not evaluable" while calibrating; sleep debt is unknown
 *   below 4 recorded nights and counts naps. Weekly HRV status against a baseline before the week.
 *   Sleep consistency is the Sleep Regularity Index. Strain target from a personal 14-day base;
 *   sleep-need strain term is a personal z.
 * - 4: new derived outputs persisted by the pipeline (docs/FORMULAS.md, "Version 4"): motion-gated daytime
 *   stress (day aggregate, mean level, minutes per band), sleeping heart-rate dip. Computed on read and not
 *   stored: energy bank, post-workout heart-rate recovery, journal effects, VO2 max category, fitness age.
 *   No existing formula changed; the bump makes older derived history replay so every day carries the new rows.
 * - 5: sleep score recalibrated (docs/FORMULAS.md section 4, docs/DECISIONS.md D15): five parts, duration 0.35
 *   (0 at target - 225 min), restoration 0.25 (new: sleeping HR and ln RMSSD z against personal mean/SD baselines,
 *   breathing-rate penalty), stage quality 0.15 (against the personal usual), efficiency 0.15 (65/85/95 anchors),
 *   consistency 0.10 (Sleep Regularity Index); availableWeight and confidence; recovery takes the behavioural sleep
 *   score so overnight HRV / heart rate / breathing rate are not counted twice. Stored sleep and recovery scores replay.
 */
const val ANALYTICS_ALGORITHM_VERSION: Int = 5
