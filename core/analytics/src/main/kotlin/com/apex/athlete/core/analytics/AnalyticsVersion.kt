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
 */
const val ANALYTICS_ALGORITHM_VERSION: Int = 2
