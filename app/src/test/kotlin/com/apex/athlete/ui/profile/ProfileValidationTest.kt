package com.apex.athlete.ui.profile

import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.data.settings.UserProfile
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ProfileValidationTest {
    private val year = 2026
    private val empty = UserProfile()

    @Test
    fun blankFieldsAreOptional() {
        assertEquals(Parsed.Blank, parseBirthYear("  ", year))
        assertEquals(Parsed.Blank, parseHeightCm("", UnitSystem.METRIC))
        assertEquals(Parsed.Blank, parseWeightKg("", UnitSystem.IMPERIAL))
        assertEquals(Parsed.Blank, parseMaxHeartRate(""))
    }

    @Test
    fun birthYearRangeFollowsAgeFiveToHundredTen() {
        assertEquals(Parsed.Ok(1990), parseBirthYear("1990", year))
        assertEquals(Parsed.Ok(2021), parseBirthYear("2021", year))
        assertEquals(Parsed.Ok(1916), parseBirthYear("1916", year))
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseBirthYear("2022", year)).kind)
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseBirthYear("1915", year)).kind)
        assertEquals(BadKind.NOT_WHOLE, assertIs<Parsed.Bad>(parseBirthYear("1990.5", year)).kind)
        assertEquals(BadKind.NOT_NUMBER, assertIs<Parsed.Bad>(parseBirthYear("abc", year)).kind)
    }

    @Test
    fun maxHeartRateRange() {
        assertEquals(Parsed.Ok(190), parseMaxHeartRate("190"))
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseMaxHeartRate("99")).kind)
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseMaxHeartRate("231")).kind)
    }

    @Test
    fun heightAndWeightAcceptCommaDecimalsAndConvertImperial() {
        assertEquals(Parsed.Ok(180.5), parseHeightCm("180,5", UnitSystem.METRIC))
        val inches = assertIs<Parsed.Ok<Double>>(parseHeightCm("70", UnitSystem.IMPERIAL))
        assertEquals(177.8, inches.value, 1e-9)
        val lb = assertIs<Parsed.Ok<Double>>(parseWeightKg("176", UnitSystem.IMPERIAL))
        assertEquals(79.83, lb.value, 0.01)
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseHeightCm("39", UnitSystem.IMPERIAL)).kind)
        assertEquals(BadKind.RANGE, assertIs<Parsed.Bad>(parseWeightKg("20", UnitSystem.METRIC)).kind)
        assertEquals(BadKind.NOT_NUMBER, assertIs<Parsed.Bad>(parseWeightKg("NaN", UnitSystem.METRIC)).kind)
    }

    @Test
    fun errorCarriesTheRangeInTheEnteredUnit() {
        val bad = assertIs<Parsed.Bad>(parseHeightCm("500", UnitSystem.IMPERIAL))
        assertEquals(ProfileLimits.HEIGHT_IN, bad.range)
    }

    @Test
    fun validFormProducesProfileAndKeepsZoneMethod() {
        val original = UserProfile(zoneMethod = com.apex.athlete.core.analytics.strain.ZoneMethod.HEART_RATE_RESERVE)
        val input = ProfileInput("1990", Sex.FEMALE, "170", "60", "188")
        val e = evaluateProfile(original, input, UnitSystem.METRIC, year)
        assertTrue(e.errors.isEmpty())
        val p = assertNotNull(e.profile)
        assertEquals(1990, p.birthYear)
        assertEquals(Sex.FEMALE, p.sex)
        assertEquals(170.0, p.heightCm)
        assertEquals(60.0, p.weightKg)
        assertEquals(188, p.maxHeartRateOverride)
        assertEquals(original.zoneMethod, p.zoneMethod)
    }

    @Test
    fun invalidFieldBlocksSave() {
        val e = evaluateProfile(empty, ProfileInput(birthYear = "1800", maxHeartRate = "50"), UnitSystem.METRIC, year)
        assertNull(e.profile)
        assertEquals(setOf(ProfileField.BIRTH_YEAR, ProfileField.MAX_HEART_RATE), e.errors.keys)
    }

    @Test
    fun clearingAFieldStoresNull() {
        val original = UserProfile(birthYear = 1990, maxHeartRateOverride = 190)
        val e = evaluateProfile(original, ProfileInput("1990", Sex.UNSPECIFIED, "", "", ""), UnitSystem.METRIC, year)
        assertNull(e.profile?.maxHeartRateOverride)
        assertEquals(1990, e.profile?.birthYear)
    }

    @Test
    fun untouchedFieldsKeepTheirStoredValueDespiteDisplayRounding() {
        val original = UserProfile(heightCm = 177.123, weightKg = 79.4567)
        val input = ProfileInput.from(original, UnitSystem.IMPERIAL)
        val e = evaluateProfile(original, input, UnitSystem.IMPERIAL, year)
        assertEquals(original, e.profile)
    }

    @Test
    fun maxHeartRateEnteredWinsOverAgeEstimate() {
        val e = evaluateProfile(empty, ProfileInput("1990", Sex.MALE, "", "", "192"), UnitSystem.METRIC, year)
        assertEquals(MaxHrInUse(192, MaxHrSource.ENTERED), maxHeartRateFromProfile(e, year))
    }

    @Test
    fun ageEstimateUsesTanaka() {
        val e = evaluateProfile(empty, ProfileInput(birthYear = "1996"), UnitSystem.METRIC, year) // age 30
        assertEquals(MaxHrInUse(187, MaxHrSource.AGE_ESTIMATE), maxHeartRateFromProfile(e, year))
    }

    @Test
    fun noInputsMeansNoEstimate() {
        assertNull(maxHeartRateFromProfile(evaluateProfile(empty, ProfileInput(), UnitSystem.METRIC, year), year))
    }

    @Test
    fun displayTextTrimsTrailingZero() {
        assertEquals("180", heightText(180.0, UnitSystem.METRIC))
        assertEquals("70", heightText(177.8, UnitSystem.IMPERIAL))
        assertEquals("", weightText(null, UnitSystem.METRIC))
    }
}
