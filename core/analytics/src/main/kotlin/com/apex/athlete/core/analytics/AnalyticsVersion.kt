package com.apex.athlete.core.analytics

/**
 * Version of the formulas in this module. Stored next to every derived value so that scores
 * computed with an older formula set can be found and recomputed after an upgrade.
 * Bump whenever a formula or default constant changes; record the change in docs/FORMULAS.md.
 */
const val ANALYTICS_ALGORITHM_VERSION: Int = 1
