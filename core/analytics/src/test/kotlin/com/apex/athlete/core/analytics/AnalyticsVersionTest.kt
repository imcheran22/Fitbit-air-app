package com.apex.athlete.core.analytics

import kotlin.test.Test
import kotlin.test.assertEquals

class AnalyticsVersionTest {
    @Test
    fun `formula set is version 3`() {
        // Bumped for: additive recovery penalties, load gating and wear coverage, robust HRmax,
        // resting-HR anchor, weekly HRV status, Sleep Regularity Index, personal strain target and need.
        assertEquals(3, ANALYTICS_ALGORITHM_VERSION)
    }
}
