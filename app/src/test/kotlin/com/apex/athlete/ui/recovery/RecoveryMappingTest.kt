package com.apex.athlete.ui.recovery

import com.apex.athlete.core.analytics.baseline.Baseline
import com.apex.athlete.core.analytics.baseline.BaselineStatus
import com.apex.athlete.core.analytics.baseline.ValueTransform
import com.apex.athlete.core.analytics.recovery.RecoveryCategory
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.recovery.RecoveryContribution
import com.apex.athlete.core.analytics.recovery.RecoveryResult
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.domain.DataProvenance
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class RecoveryMappingTest {

    private fun contribution(component: RecoveryComponent, impact: Double, available: Boolean = true) =
        RecoveryContribution(component, available, if (available) 50.0 else null, 0.25, if (available) 0.25 else 0.0, 0.0, impact)

    private fun result(
        status: RecoveryStatus = RecoveryStatus.SCORED,
        contributions: List<RecoveryContribution> = emptyList(),
    ) = RecoveryResult(
        status = status,
        score = if (status == RecoveryStatus.SCORED) 70.0 else null,
        scorePercent = if (status == RecoveryStatus.SCORED) 70 else null,
        category = RecoveryCategory.PEAK.takeIf { status == RecoveryStatus.SCORED },
        recommendation = null,
        contributions = contributions,
        positiveContributors = contributions.filter { it.impact > 0 }.sortedByDescending { it.impact },
        negativeContributors = contributions.filter { it.impact < 0 }.sortedBy { it.impact },
        missingComponents = emptyList(),
        calibrationDaysRemaining = null,
        provenance = DataProvenance.MATHEMATICALLY_DERIVED,
    )

    private fun baseline(lo: Double?, hi: Double?) = Baseline(
        status = if (lo != null) BaselineStatus.ESTABLISHED else BaselineStatus.CALIBRATING,
        validDays = 10, requiredDays = 7, windowDays = 30, transform = ValueTransform.IDENTITY,
        center = 50.0, lowerNormal = lo, upperNormal = hi, transformedMean = 50.0, transformedSd = 5.0,
        effectiveSd = 5.0, zClamp = 3.0,
    )

    @Test fun halfWidthIsHalfTheNormalRange() {
        assertEquals(5.0, normalHalfWidth(baseline(45.0, 55.0)))
    }

    @Test fun halfWidthIsNullWhileCalibrating() {
        assertNull(normalHalfWidth(baseline(null, null)))
    }

    @Test fun driversSkipMissingInputs() {
        val r = result(contributions = listOf(
            contribution(RecoveryComponent.HRV, 12.0),
            contribution(RecoveryComponent.RESPIRATORY_RATE, 0.0, available = false),
        ))
        assertEquals(listOf(RecoveryComponent.HRV), driversOf(r).map { it.component })
    }

    @Test fun insightNamesTheLargestRaisingInput() {
        val r = result(contributions = listOf(
            contribution(RecoveryComponent.HRV, 12.0),
            contribution(RecoveryComponent.RESTING_HEART_RATE, -4.0),
        ))
        assertEquals(RecoveryInsight.Raised(RecoveryComponent.HRV), insightOf(r))
    }

    @Test fun insightNamesTheLargestLoweringInput() {
        val r = result(contributions = listOf(
            contribution(RecoveryComponent.HRV, 2.0),
            contribution(RecoveryComponent.SLEEP, -9.0),
        ))
        assertEquals(RecoveryInsight.Lowered(RecoveryComponent.SLEEP), insightOf(r))
    }

    @Test fun smallMovesAreBalanced() {
        val r = result(contributions = listOf(contribution(RecoveryComponent.HRV, 0.2), contribution(RecoveryComponent.SLEEP, -0.1)))
        assertIs<RecoveryInsight.Balanced>(insightOf(r))
    }

    @Test fun calibratingAndUnavailableHaveOwnInsights() {
        assertIs<RecoveryInsight.Calibrating>(insightOf(result(RecoveryStatus.CALIBRATING)))
        assertIs<RecoveryInsight.Unavailable>(insightOf(result(RecoveryStatus.UNAVAILABLE)))
    }
}
