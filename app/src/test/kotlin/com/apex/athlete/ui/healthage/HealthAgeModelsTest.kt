package com.apex.athlete.ui.healthage

import com.apex.athlete.R
import com.apex.athlete.core.analytics.healthage.FactorInput
import com.apex.athlete.core.analytics.healthage.HealthAge
import com.apex.athlete.core.analytics.healthage.HealthAgeInput
import com.apex.athlete.core.analytics.healthage.HealthAgeNoDataReason
import com.apex.athlete.core.analytics.healthage.HealthAgeResult
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.domain.DataProvenance
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class HealthAgeModelsTest {
    private fun d(v: Double, days: Int = 14) = FactorInput(v, days)

    private val full = HealthAgeInput(
        chronologicalAgeYears = 40, sex = Sex.MALE,
        vo2Max = d(37.8, 3), restingHeartRateBpm = d(55.0), sleepDurationMinutes = d(360.0),
        sleepRegularityIndex = d(85.0), dailySteps = d(10_000.0), bmi = d(30.0, 1),
    )

    private fun ready(result: HealthAgeResult, demo: Boolean = false) = buildHealthAgeUi(HealthAgeLoad.Ready(result, demo))

    @Test fun nonResultStatesMapOneToOne() {
        assertEquals(HealthAgeUi.Pending, buildHealthAgeUi(HealthAgeLoad.Pending))
        assertEquals(HealthAgeUi.Off, buildHealthAgeUi(HealthAgeLoad.Off))
        assertEquals(HealthAgeUi.Loading, buildHealthAgeUi(HealthAgeLoad.Loading))
        assertEquals(HealthAgeUi.Failed, buildHealthAgeUi(HealthAgeLoad.Failed))
    }

    @Test fun healthTabShowsTheCardOnlyWhileOn() {
        assertFalse(HealthAgeUi.Off.showsOnHealthTab())
        assertFalse(HealthAgeUi.Pending.showsOnHealthTab())
        assertTrue(HealthAgeUi.Loading.showsOnHealthTab())
        assertTrue(HealthAgeUi.Failed.showsOnHealthTab())
        assertTrue(ready(HealthAge.estimate(full)).showsOnHealthTab())
    }

    @Test fun noDataMapsTheReason() {
        assertEquals(
            HealthAgeUi.NoData(R.string.healthage_nodata_no_age),
            ready(HealthAge.estimate(full.copy(chronologicalAgeYears = null))),
        )
        assertEquals(
            HealthAgeUi.NoData(R.string.healthage_nodata_age_range),
            ready(HealthAgeResult.NoData(HealthAgeNoDataReason.AGE_OUT_OF_RANGE)),
        )
    }

    @Test fun notEnoughDataCarriesReasonCountAndWithheldReasons() {
        val r = HealthAge.estimate(HealthAgeInput(chronologicalAgeYears = 40, restingHeartRateBpm = d(60.0, 5)))
        val ui = assertIs<HealthAgeUi.NotEnough>(ready(r))
        assertEquals(R.string.healthage_notenough_reason, ui.reasonRes)
        assertEquals(0, ui.scoredDaySeriesFactors)
        val rhr = ui.withheld.single { it.nameRes == R.string.healthage_factor_rhr }
        assertEquals(R.string.healthage_withheld_days, rhr.reasonRes)
        val vo2 = ui.withheld.single { it.nameRes == R.string.healthage_factor_vo2 }
        assertEquals(R.string.healthage_withheld_missing, vo2.reasonRes)
    }

    @Test fun estimateShowsAgeDeltaConfidenceAndEstimatedProvenance() {
        Locale.setDefault(Locale.US)
        val ui = assertIs<HealthAgeUi.Estimate>(ready(HealthAge.estimate(full), demo = true))
        assertEquals(40.9, ui.age.value, 1e-9)
        assertEquals(DataProvenance.ESTIMATED, ui.age.provenance)
        assertEquals(1, ui.age.decimals)
        assertEquals(40, ui.chronologicalAge)
        assertEquals(0.9, ui.deltaYears, 1e-9)
        assertEquals("+0.9", ui.deltaText)
        assertEquals(AgeDirection.OLDER, ui.direction)
        assertEquals(R.string.healthage_confidence_high, ui.confidenceRes)
        assertTrue(ui.isDemo)
        assertEquals(HealthAge.DISCLAIMER, ui.disclaimer)
    }

    @Test fun factorRowsCarryYearsDirectionValueAndDays() {
        Locale.setDefault(Locale.US)
        val ui = assertIs<HealthAgeUi.Estimate>(ready(HealthAge.estimate(full)))
        val steps = ui.factors.single { it.nameRes == R.string.healthage_factor_steps }
        assertEquals("−1.5", steps.yearsText)
        assertEquals(AgeDirection.YOUNGER, steps.direction)
        assertEquals(14, steps.days)
        assertEquals(10_000.0, steps.value.value, 1e-9)
        val bmi = ui.factors.single { it.nameRes == R.string.healthage_factor_bmi }
        assertEquals("+2.5", bmi.yearsText)
        assertEquals(1, bmi.days)
        // Sleep minutes are shown as hours.
        val sleep = ui.factors.single { it.nameRes == R.string.healthage_factor_sleep }
        assertEquals(6.0, sleep.value.value, 1e-9)
        assertEquals(R.string.healthage_unit_hours, sleep.unitRes)
        assertTrue(ui.factors.all { it.value.provenance == DataProvenance.MATHEMATICALLY_DERIVED })
    }

    @Test fun withheldFactorsAreListedWithPlainReasons() {
        val ui = assertIs<HealthAgeUi.Estimate>(ready(HealthAge.estimate(full.copy(hrvRmssdMs = d(50.0)))))
        val hrv = ui.withheld.single { it.nameRes == R.string.healthage_factor_hrv }
        assertEquals(R.string.healthage_withheld_norm, hrv.reasonRes)
    }

    @Test fun heartRateRatioVo2IsWithheldNotCounted() {
        val ui = assertIs<HealthAgeUi.Estimate>(
            ready(HealthAge.estimate(full.copy(vo2MaxDerivedFromRestingHr = true))),
        )
        assertTrue(ui.factors.none { it.nameRes == R.string.healthage_factor_vo2 })
        assertEquals(R.string.healthage_withheld_derived, ui.withheld.single { it.nameRes == R.string.healthage_factor_vo2 }.reasonRes)
    }

    @Test fun cappedTotalAndSameAgeAreReported() {
        val worst = HealthAgeInput(
            chronologicalAgeYears = 40, sex = Sex.MALE, vo2Max = d(10.0, 1), restingHeartRateBpm = d(100.0),
            sleepDurationMinutes = d(150.0), sleepRegularityIndex = d(-50.0), dailySteps = d(500.0), bmi = d(45.0, 1),
        )
        val capped = assertIs<HealthAgeUi.Estimate>(ready(HealthAge.estimate(worst)))
        assertTrue(capped.totalCapped)
        assertEquals(10.0, capped.deltaYears, 1e-9)
        assertEquals(AgeDirection.OLDER, capped.direction)

        assertEquals(AgeDirection.SAME, assertIs<HealthAgeUi.Estimate>(ready(sameAge())).direction)
    }

    @Test fun roundingToZeroNeverReadsAsOlderOrYounger() {
        Locale.setDefault(Locale.US)
        assertEquals("0.0", signedYears(0.04))
        assertEquals("0.0", signedYears(-0.04))
        assertEquals("+0.1", signedYears(0.06))
        assertEquals(0.0, roundYears(0.04), 0.0)
    }

    private fun sameAge(): HealthAgeResult.Estimate {
        // RHR 65 (0), sleep 8 h (0), SRI 75 (0), steps 7000 (0) -> every factor is exactly neutral.
        val r = HealthAge.estimate(
            HealthAgeInput(
                chronologicalAgeYears = 40, restingHeartRateBpm = d(65.0), sleepDurationMinutes = d(480.0),
                sleepRegularityIndex = d(75.0), dailySteps = d(7000.0),
            ),
        )
        return assertIs<HealthAgeResult.Estimate>(r)
    }
}
