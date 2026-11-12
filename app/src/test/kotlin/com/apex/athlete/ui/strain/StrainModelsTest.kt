package com.apex.athlete.ui.strain

import com.apex.athlete.core.analytics.load.LoadPoint
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.StrainResult
import com.apex.athlete.core.analytics.strain.ZoneMethod
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StrainModelsTest {
    private val model = HeartRateZoneModel(ZoneMethod.PERCENT_OF_MAX_HEART_RATE, listOf(93.0, 112.0, 130.0, 149.0, 167.0), 186.0)

    private fun strain(minutes: Map<HeartRateZone, Double>) =
        StrainResult(strain = 9.4, trimp = 80.0, minutesByZone = minutes, loadMinutes = 60.0, recordedMinutes = 600.0)

    @Test
    fun zonesAreHottestFirstWithBelowZoneLast() {
        val rows = zoneRows(strain(HeartRateZone.entries.associateWith { 1.0 }), model)
        assertEquals(
            listOf(
                HeartRateZone.ZONE_5, HeartRateZone.ZONE_4, HeartRateZone.ZONE_3,
                HeartRateZone.ZONE_2, HeartRateZone.ZONE_1, HeartRateZone.BELOW_ZONES,
            ),
            rows.map { it.zone },
        )
    }

    @Test
    fun minutesBecomeSecondsAndAMissingZoneStaysUnknown() {
        val rows = zoneRows(strain(mapOf(HeartRateZone.ZONE_3 to 12.5, HeartRateZone.ZONE_1 to 0.0)), model)
        assertEquals(750L, rows.first { it.zone == HeartRateZone.ZONE_3 }.seconds)
        assertEquals(0L, rows.first { it.zone == HeartRateZone.ZONE_1 }.seconds)
        assertNull(rows.first { it.zone == HeartRateZone.ZONE_5 }.seconds)
        assertTrue(hasZoneData(rows))
    }

    @Test
    fun noStrainMeansNoRows() {
        assertTrue(zoneRows(null, model).isEmpty())
        assertFalse(hasZoneData(zoneRows(null, model)))
    }

    @Test
    fun rangesComeFromTheZoneModel() {
        val rows = zoneRows(strain(HeartRateZone.entries.associateWith { 1.0 }), model)
        val z5 = rows.first { it.zone == HeartRateZone.ZONE_5 }
        assertTrue(z5.openEnded)
        assertEquals(167, z5.lowBpm)
        assertNull(z5.highBpm)
        val z3 = rows.first { it.zone == HeartRateZone.ZONE_3 }
        assertEquals(130, z3.lowBpm)
        assertEquals(149, z3.highBpm)
        val below = rows.first { it.zone == HeartRateZone.BELOW_ZONES }
        assertNull(below.lowBpm)
        assertEquals(93, below.highBpm)
    }

    @Test
    fun withoutAZoneModelThereAreNoRanges() {
        val rows = zoneRows(strain(mapOf(HeartRateZone.ZONE_2 to 5.0)), null)
        assertTrue(rows.all { it.lowBpm == null && it.highBpm == null })
    }

    @Test
    fun loadSeriesKeepsGapsAndComputesTheCoupledRatio() {
        val data = loadChartData(
            listOf(
                LoadPoint(100, 50.0, 40.0, 50.0),
                LoadPoint(101, null, null, null),
                LoadPoint(102, 10.0, 30.0, 0.0),
                LoadPoint(103, 10.0, null, 20.0),
            ),
        )
        assertEquals(listOf(0.8, null, null, null), data.acwr.map { it.y })
        assertEquals(listOf(40.0, null, 30.0, null), data.acute.map { it.y })
        assertEquals(listOf(100L, 101L, 102L, 103L), data.chronic.map { it.x })
        assertFalse(data.isEmpty)
    }

    @Test
    fun loadSeriesIsTrimmedToTheLastDaysAndAllGapsIsEmpty() {
        val series = (0L until 100L).map { LoadPoint(it, null, null, null) }
        val data = loadChartData(series, maxDays = 56)
        assertEquals(56, data.acute.size)
        assertEquals(44L, data.acute.first().x)
        assertTrue(data.isEmpty)
    }
}
