package com.apex.athlete.ui.healthage

import com.apex.athlete.core.analytics.healthage.FactorInput
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.AppSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HealthAgeInputBuilderTest {
    private fun sources(
        vo2: List<Double?> = emptyList(),
        fallback: Vo2Fallback? = null,
        rhr: List<Double?> = emptyList(),
        sleep: List<Double?> = emptyList(),
        steps: List<Double?> = emptyList(),
        sri: Double? = null,
        sriNights: Int = 0,
        bmi: Double? = null,
        age: Int? = 40,
        sex: Sex = Sex.MALE,
    ) = HealthAgeSources(false, age, sex, vo2, fallback, rhr, sleep, steps, sri, sriNights, bmi)

    @Test fun settingDefaultsOff() {
        assertFalse(AppSettings().healthAgeEnabled)
    }

    @Test fun emptySourcesGiveNoFactors() {
        val i = buildHealthAgeInput(sources(age = null))
        assertNull(i.chronologicalAgeYears)
        assertNull(i.vo2Max)
        assertNull(i.restingHeartRateBpm)
        assertNull(i.sleepDurationMinutes)
        assertNull(i.sleepRegularityIndex)
        assertNull(i.dailySteps)
        assertNull(i.bmi)
        assertNull(i.hrvRmssdMs)
    }

    @Test fun vo2IsTheMedianOfDeviceDaysAndNotFlaggedDerived() {
        val i = buildHealthAgeInput(sources(vo2 = listOf(40.0, null, 44.0, 50.0, null), fallback = Vo2Fallback(30.0, true)))
        assertEquals(FactorInput(44.0, 3), i.vo2Max)
        assertFalse(i.vo2MaxDerivedFromRestingHr)
    }

    @Test fun evenCountMedianAveragesTheMiddlePair() {
        val i = buildHealthAgeInput(sources(rhr = listOf(60.0, 50.0, 70.0, 56.0)))
        assertEquals(FactorInput(58.0, 4), i.restingHeartRateBpm)
    }

    @Test fun heartRateRatioFallbackIsFlaggedAsDerived() {
        val i = buildHealthAgeInput(sources(vo2 = listOf(null, null), fallback = Vo2Fallback(38.0, derivedFromRestingHr = true)))
        assertEquals(FactorInput(38.0, 1), i.vo2Max)
        assertTrue(i.vo2MaxDerivedFromRestingHr)
    }

    @Test fun deviceFallbackOlderThanTheWindowIsNotDerived() {
        val i = buildHealthAgeInput(sources(fallback = Vo2Fallback(41.0, derivedFromRestingHr = false)))
        assertEquals(FactorInput(41.0, 1), i.vo2Max)
        assertFalse(i.vo2MaxDerivedFromRestingHr)
    }

    @Test fun noVo2AtAllStaysMissingAndUnflagged() {
        val i = buildHealthAgeInput(sources())
        assertNull(i.vo2Max)
        assertFalse(i.vo2MaxDerivedFromRestingHr)
    }

    @Test fun sleepAndStepsAreMeansOverRecordedDaysOnly() {
        val i = buildHealthAgeInput(
            sources(
                sleep = listOf(400.0, null, 440.0, 0.0),
                steps = listOf(8000.0, 0.0, null, 6000.0), // 0 = band not worn, not a day of no walking
            ),
        )
        assertEquals(FactorInput(420.0, 2), i.sleepDurationMinutes)
        assertEquals(FactorInput(7000.0, 2), i.dailySteps)
    }

    @Test fun gapsAreNeverCountedAsDays() {
        val i = buildHealthAgeInput(sources(rhr = List(30) { if (it % 2 == 0) 55.0 else null }))
        assertEquals(15, i.restingHeartRateBpm!!.daysOfData)
    }

    @Test fun regularityNeedsNightsAndABmiIsOnePointValue() {
        assertNull(buildHealthAgeInput(sources(sri = 80.0, sriNights = 0)).sleepRegularityIndex)
        assertNull(buildHealthAgeInput(sources(sri = null, sriNights = 20)).sleepRegularityIndex)
        val i = buildHealthAgeInput(sources(sri = 80.0, sriNights = 22, bmi = 23.4))
        assertEquals(FactorInput(80.0, 22), i.sleepRegularityIndex)
        assertEquals(FactorInput(23.4, 1), i.bmi)
    }

    @Test fun nonFiniteValuesAreDropped() {
        val i = buildHealthAgeInput(sources(rhr = listOf(Double.NaN, Double.POSITIVE_INFINITY), bmi = Double.NaN, sri = Double.NaN, sriNights = 5))
        assertNull(i.restingHeartRateBpm)
        assertNull(i.bmi)
        assertNull(i.sleepRegularityIndex)
    }

    @Test fun ageAndSexPassThrough() {
        val i = buildHealthAgeInput(sources(age = 52, sex = Sex.FEMALE))
        assertEquals(52, i.chronologicalAgeYears)
        assertEquals(Sex.FEMALE, i.sexOrNull())
    }

    private fun com.apex.athlete.core.analytics.healthage.HealthAgeInput.sexOrNull() = sex
}
