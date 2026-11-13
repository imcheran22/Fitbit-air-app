package com.apex.athlete.ui.sleep

import com.apex.athlete.R
import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDipResult
import com.apex.athlete.core.analytics.sleep.SleepRegularity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SleepPatternsMappingTest {
    private val derived = DataProvenance.MATHEMATICALLY_DERIVED

    @Test fun regularityBelowTwoPairsIsCalibratingWithPairsStillNeeded() {
        assertEquals(MetricState.Calibrating(2), sleepRegularityState(SleepRegularity(null, 0)))
        assertEquals(MetricState.Calibrating(1), sleepRegularityState(SleepRegularity(null, 1440)))
    }

    @Test fun regularityWithAnIndexIsAValueIncludingNegativeOnes() {
        assertEquals(MetricState.Value(72.5, 0, null, derived), sleepRegularityState(SleepRegularity(72.5, 4320)))
        assertEquals(MetricState.Value(-12.0, 0, null, derived), sleepRegularityState(SleepRegularity(-12.0, 2880)))
    }

    @Test fun dipIsShownInPercentWithItsCategory() {
        val ui = hrDipOf(HeartRateDipResult(0.125, DipCategory.DIPPER, null))
        assertEquals(MetricState.Value(12.5, 1, "%", derived), ui.state)
        assertEquals(DipCategory.DIPPER, ui.category)
        assertNull(ui.missingReasonRes)
    }

    @Test fun aReversedDipKeepsItsSign() {
        val ui = hrDipOf(HeartRateDipResult(-0.04, DipCategory.REVERSED, null))
        assertEquals(MetricState.Value(-4.0, 1, "%", derived), ui.state)
        assertEquals(DipCategory.REVERSED, ui.category)
    }

    @Test fun missingDipSaysWhy() {
        val none = hrDipOf(HeartRateDipResult(null, null, DipMissing.NO_SLEEPING_HEART_RATE))
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), none.state)
        assertNull(none.category)
        assertEquals(R.string.sleep_dip_missing_sleeping, none.missingReasonRes)
        assertEquals(R.string.sleep_dip_missing_daytime, dipMissingRes(DipMissing.NO_DAYTIME_HEART_RATE))
        assertEquals(R.string.sleep_dip_missing_few, dipMissingRes(DipMissing.TOO_FEW_MINUTES))
        assertEquals(R.string.sleep_dip_missing_generic, dipMissingRes(DipMissing.INVALID_INPUT))
        assertEquals(R.string.sleep_dip_missing_generic, dipMissingRes(null))
    }

    @Test fun sleepDebtBelowFourNightsIsCalibratingNeverZero() {
        assertEquals(MetricState.Calibrating(null), sleepDebtState(null))
        assertEquals(MetricState.Value(1.5, 1, "h", derived), sleepDebtState(90.0))
        assertEquals(MetricState.Value(0.0, 1, "h", derived), sleepDebtState(0.0)) // a measured zero debt is a real value
    }
}
