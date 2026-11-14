package com.apex.athlete.core.analytics

import kotlin.test.Test
import kotlin.test.assertEquals

class AnalyticsVersionTest {
    @Test
    fun `formula set is version 7`() {
        // 7: WASO only within staged coverage (null under 95 %).
        // 6: research metrics persisted (robust z, HRV CV7, SRI, midpoint, guideline shortfall, WASO, sedentary, cadence).
        // 5: sleep score recalibrated (restoration part, stage quality vs personal usual, behavioural score to recovery).
        // 4: stress, heart-rate dip and the other version-4 outputs are persisted/exposed by the pipeline.
        // 3 was: additive recovery penalties, load gating and wear coverage, robust HRmax,
        // resting-HR anchor, weekly HRV status, Sleep Regularity Index, personal strain target and need.
        assertEquals(7, ANALYTICS_ALGORITHM_VERSION)
    }
}
