package com.apex.athlete.ui.sleep

import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.components.ContributorStatus
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SleepMappingTest {

    @Test fun statusBands() {
        assertEquals(ContributorStatus.Optimal, statusOfPercent(85.0))
        assertEquals(ContributorStatus.Sufficient, statusOfPercent(84.9))
        assertEquals(ContributorStatus.Sufficient, statusOfPercent(70.0))
        assertEquals(ContributorStatus.Poor, statusOfPercent(69.9))
    }

    @Test fun missingFigureHasNoStatus() {
        assertNull(statusOfPercent(null))
        assertNull(statusOfPercent(Double.NaN))
    }

    @Test fun segmentsKeepTimesAndStagesAndGaps() {
        val stages = listOf(
            SleepStageSegmentEntity("s", 1_000L, 2_000L, SleepStage.LIGHT),
            SleepStageSegmentEntity("s", 5_000L, 6_000L, SleepStage.DEEP),
        )
        val out = segmentsOf(stages)
        assertEquals(2, out.size)
        assertEquals(1_000L, out[0].startMillis)
        assertEquals(SleepStage.DEEP, out[1].stage)
        assertEquals(5_000L, out[1].startMillis) // the gap between the two stays a gap
    }
}
