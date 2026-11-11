package com.hcwebhook.app

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

class NutritionNutrientsTest {

    @Test
    fun extraNutrients_containsOnlySetValuesInGrams() {
        val record = NutritionRecord(
            startTime = Instant.parse("2026-05-09T07:00:00Z"),
            startZoneOffset = ZoneOffset.UTC,
            endTime = Instant.parse("2026-05-09T19:00:00Z"),
            endZoneOffset = ZoneOffset.UTC,
            metadata = Metadata.manualEntry(),
            energyFromFat = Energy.kilocalories(180.0),
            saturatedFat = Mass.grams(6.5),
            vitaminC = Mass.milligrams(90.0),
            calcium = Mass.grams(1.0),
        )

        val nutrients = record.extraNutrients()

        assertEquals(180.0, nutrients["energy_from_fat_calories"]!!, 1e-9)
        assertEquals(6.5, nutrients["saturated_fat_grams"]!!, 1e-9)
        assertEquals(0.09, nutrients["vitamin_c_grams"]!!, 1e-9)
        assertEquals(1.0, nutrients["calcium_grams"]!!, 1e-9)
        assertEquals(4, nutrients.size)
        assertFalse(nutrients.containsKey("iron_grams"))
    }

    @Test
    fun extraNutrients_isEmptyWhenNothingSet() {
        val record = NutritionRecord(
            startTime = Instant.parse("2026-05-09T07:00:00Z"),
            startZoneOffset = null,
            endTime = Instant.parse("2026-05-09T19:00:00Z"),
            endZoneOffset = null,
            metadata = Metadata.manualEntry(),
        )
        assertEquals(emptyMap<String, Double>(), record.extraNutrients())
    }
}
