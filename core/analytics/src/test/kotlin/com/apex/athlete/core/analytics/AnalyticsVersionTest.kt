package com.apex.athlete.core.analytics

import kotlin.test.Test
import kotlin.test.assertEquals

class AnalyticsVersionTest {
    @Test
    fun `formula set is version 4`() {
        // 4: stress, heart-rate dip and the other version-4 outputs are persisted/exposed by the pipeline.
        // 3 was: additive recovery penalties, load gating and wear coverage, robust HRmax,
        // resting-HR anchor, weekly HRV status, Sleep Regularity Index, personal strain target and need.
        assertEquals(4, ANALYTICS_ALGORITHM_VERSION)
    }
}
