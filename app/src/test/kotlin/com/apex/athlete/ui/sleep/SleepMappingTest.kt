package com.apex.athlete.ui.sleep

import com.apex.athlete.core.analytics.sleep.SleepBand
import com.apex.athlete.core.analytics.sleep.SleepBands
import com.apex.athlete.core.analytics.sleep.SleepComponent
import com.apex.athlete.core.analytics.sleep.SleepContribution
import com.apex.athlete.core.analytics.sleep.SleepScoreConfidence
import com.apex.athlete.core.analytics.sleep.SleepScoreResult
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.components.ContributorStatus
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class SleepMappingTest {

    private fun result(
        score: Double = 90.0,
        asleep: Double = 450.0,
        confidence: SleepScoreConfidence = SleepScoreConfidence.HIGH,
        restorationAvailable: Boolean = true,
    ) = SleepScoreResult(
        score = score, scorePercent = score.toInt(), behaviouralScore = score, availableWeight = 1.0, confidence = confidence,
        contributions = SleepComponent.entries.map {
            val ok = it != SleepComponent.RESTORATION || restorationAvailable
            SleepContribution(it, ok, if (ok) 80.0 else null, if (ok) it.nominalWeight else 0.0, if (ok) 20.0 else 0.0)
        },
        needMinutes = 450.0, durationTargetMinutes = 450.0, asleepMinutes = asleep, deficitMinutes = 0.0,
        restorationZ = if (restorationAvailable) 0.6 else null, restorativeFraction = 0.4, deepFraction = 0.2, remFraction = 0.2,
        lightFraction = 0.5, efficiencyPercent = 90.0, onsetStdDevMinutes = 20.0, wakeStdDevMinutes = 20.0,
        sufficientForRecovery = true,
    )

    @Test fun bandsMapToStatus() {
        assertEquals(ContributorStatus.Optimal, SleepBand.OPTIMAL.toStatus())
        assertEquals(ContributorStatus.Sufficient, SleepBand.SUFFICIENT.toStatus())
        assertEquals(ContributorStatus.Poor, SleepBand.POOR.toStatus())
        assertNull((null as SleepBand?).toStatus())
    }

    @Test fun shortNightOverallLabelIsCappedByDuration() {
        // A score of 96 on a night at 80 % of the target must not read Optimal.
        assertEquals(ContributorStatus.Sufficient, SleepBands.overall(result(score = 96.0, asleep = 360.0)).toStatus())
        assertEquals(ContributorStatus.Optimal, SleepBands.overall(result(score = 96.0, asleep = 450.0)).toStatus())
    }

    @Test fun missingPartHasNoNumberAndAReason() {
        val parts = sleepParts(result(confidence = SleepScoreConfidence.MEDIUM, restorationAvailable = false), emptyList())
        assertEquals(5, parts.size)
        val restoration = parts.first { it.component == SleepComponent.RESTORATION }
        assertIs<MetricState.Unavailable>(restoration.state)
        assertNull(restoration.weightPercent)
        assertNull(restoration.status)
        assertNotNull(restoration.missingReasonRes)
        assertIs<MetricState.Value>(parts.first { it.component == SleepComponent.DURATION }.state)
    }

    @Test fun partialHintOnlyWhenNotHigh() {
        assertNull(partialScoreOf(result()))
        val partial = partialScoreOf(result(confidence = SleepScoreConfidence.MEDIUM, restorationAvailable = false))
        assertEquals(4, partial?.availableParts)
        assertEquals(listOf(SleepComponent.RESTORATION), partial?.missing)
    }

    @Test fun usualDirection() {
        assertEquals(VsUsual.LOWER, vsUsualOf(-0.8))
        assertEquals(VsUsual.SIMILAR, vsUsualOf(0.2))
        assertEquals(VsUsual.HIGHER, vsUsualOf(1.4))
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
