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
 */
const val ANALYTICS_ALGORITHM_VERSION: Int = 3
