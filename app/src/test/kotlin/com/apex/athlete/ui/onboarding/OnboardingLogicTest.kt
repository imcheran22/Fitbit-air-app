package com.apex.athlete.ui.onboarding

import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.ZoneMethod
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OnboardingStepsTest {
    private val none = SourceStatus()

    @Test
    fun welcomeAdvancesToProfileAndHasNoBack() {
        assertEquals(OnboardingStep.PROFILE, OnboardingSteps.next(OnboardingStep.WELCOME, true, none))
        assertNull(OnboardingSteps.back(OnboardingStep.WELCOME))
    }

    @Test
    fun profileNeedsValidInput() {
        assertNull(OnboardingSteps.next(OnboardingStep.PROFILE, profileValid = false, sources = none))
        assertEquals(OnboardingStep.SOURCES, OnboardingSteps.next(OnboardingStep.PROFILE, true, none))
    }

    @Test
    fun profileCanBeSkippedEvenWhenInvalid() {
        assertEquals(OnboardingStep.SOURCES, OnboardingSteps.skip(OnboardingStep.PROFILE))
    }

    @Test
    fun sourcesCannotBeSkippedOrPassedWithoutAChoice() {
        assertFalse(OnboardingSteps.canSkip(OnboardingStep.SOURCES))
        assertNull(OnboardingSteps.skip(OnboardingStep.SOURCES))
        assertNull(OnboardingSteps.next(OnboardingStep.SOURCES, true, none))
    }

    @Test
    fun anyOneSourceUnlocksContinue() {
        listOf(
            SourceStatus(googleConnected = true),
            SourceStatus(healthConnectReadable = true),
            SourceStatus(takeoutChosen = true),
        ).forEach {
            assertEquals(OnboardingStep.NOTIFICATIONS, OnboardingSteps.next(OnboardingStep.SOURCES, true, it))
        }
    }

    @Test
    fun notificationsAreOptional() {
        assertEquals(OnboardingStep.CALIBRATION, OnboardingSteps.skip(OnboardingStep.NOTIFICATIONS))
        assertEquals(OnboardingStep.CALIBRATION, OnboardingSteps.next(OnboardingStep.NOTIFICATIONS, true, none))
    }

    @Test
    fun finishOnlyFromTheLastStep() {
        OnboardingStep.entries.forEach { assertEquals(it == OnboardingStep.CALIBRATION, OnboardingSteps.canFinish(it)) }
        assertNull(OnboardingSteps.next(OnboardingStep.CALIBRATION, true, SourceStatus(googleConnected = true)))
    }

    @Test
    fun backWalksTheStepsInReverse() {
        assertEquals(OnboardingStep.NOTIFICATIONS, OnboardingSteps.back(OnboardingStep.CALIBRATION))
        assertEquals(OnboardingStep.SOURCES, OnboardingSteps.back(OnboardingStep.NOTIFICATIONS))
        assertEquals(OnboardingStep.PROFILE, OnboardingSteps.back(OnboardingStep.SOURCES))
        assertEquals(OnboardingStep.WELCOME, OnboardingSteps.back(OnboardingStep.PROFILE))
    }

    @Test
    fun savedStepRestoresAndUnknownFallsBack() {
        OnboardingStep.entries.forEach { assertEquals(it, OnboardingSteps.parse(it.name)) }
        assertEquals(OnboardingStep.WELCOME, OnboardingSteps.parse(null))
        assertEquals(OnboardingStep.WELCOME, OnboardingSteps.parse("GONE"))
    }

    @Test
    fun positionsCountFromTheProfileStep() {
        assertNull(OnboardingSteps.position(OnboardingStep.WELCOME))
        assertEquals(1, OnboardingSteps.position(OnboardingStep.PROFILE))
        assertEquals(OnboardingSteps.counted.size, OnboardingSteps.position(OnboardingStep.CALIBRATION))
    }
}

class ProfileRulesTest {
    private val year = 2026

    @Test
    fun blankFormIsValidAndKeepsEverythingMissing() {
        val result = ProfileRules.validate(ProfileDraft(), year)
        assertTrue(result.isValid)
        val values = result.values!!
        assertNull(values.birthYear)
        assertNull(values.heightCm)
        assertNull(values.weightKg)
        assertNull(values.maxHeartRate)
    }

    @Test
    fun acceptsValuesInRangeIncludingDecimalComma() {
        val draft = ProfileDraft("1990", Sex.FEMALE, "172,5", "64.2", "188", ZoneMethod.HEART_RATE_RESERVE)
        val values = ProfileRules.validate(draft, year).values!!
        assertEquals(1990, values.birthYear)
        assertEquals(172.5, values.heightCm)
        assertEquals(64.2, values.weightKg)
        assertEquals(188, values.maxHeartRate)
        assertEquals(Sex.FEMALE, values.sex)
        assertEquals(ZoneMethod.HEART_RATE_RESERVE, values.zoneMethod)
    }

    @Test
    fun birthYearBoundsFollowTheAnalyticsAgeRange() {
        assertTrue(ProfileRules.validate(ProfileDraft(birthYear = (year - 5).toString()), year).isValid)
        assertTrue(ProfileRules.validate(ProfileDraft(birthYear = (year - 110).toString()), year).isValid)
        assertEquals(setOf(ProfileField.BIRTH_YEAR), ProfileRules.validate(ProfileDraft(birthYear = (year - 4).toString()), year).errors)
        assertEquals(setOf(ProfileField.BIRTH_YEAR), ProfileRules.validate(ProfileDraft(birthYear = (year - 111).toString()), year).errors)
    }

    @Test
    fun rejectsOutOfRangeAndJunk() {
        val result = ProfileRules.validate(
            ProfileDraft(birthYear = "abc", heightCm = "50", weightKg = "NaN", maxHeartRate = "99"),
            year,
        )
        assertEquals(
            setOf(ProfileField.BIRTH_YEAR, ProfileField.HEIGHT, ProfileField.WEIGHT, ProfileField.MAX_HEART_RATE),
            result.errors,
        )
        assertNull(result.values)
        assertEquals(setOf(ProfileField.MAX_HEART_RATE), ProfileRules.validate(ProfileDraft(maxHeartRate = "241"), year).errors)
        assertTrue(ProfileRules.validate(ProfileDraft(maxHeartRate = "240"), year).isValid)
        assertEquals(setOf(ProfileField.WEIGHT), ProfileRules.validate(ProfileDraft(weightKg = "301"), year).errors)
    }

    @Test
    fun whitespaceOnlyCountsAsBlank() {
        assertTrue(ProfileRules.validate(ProfileDraft(heightCm = "   "), year).isValid)
    }
}

class CalibrationWindowsTest {
    @Test
    fun windowsComeFromTheEnginesAndAreSane() {
        val w = CalibrationWindows.fromEngines()
        assertTrue(w.baselineMinDays in 2..w.baselineWindowDays)
        assertTrue(w.sleepNeedNights > 0)
        assertTrue(w.workloadDays > 0)
    }
}
