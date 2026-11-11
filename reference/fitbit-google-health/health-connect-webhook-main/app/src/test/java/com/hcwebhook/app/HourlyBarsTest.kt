package com.hcwebhook.app

import org.junit.Assert.assertEquals
import org.junit.Test

class HourlyBarsTest {

    private val hour = 60 * 60 * 1000L
    private val now = 100 * hour + 30 * 60 * 1000L // 30 minutes into hour 100

    @Test
    fun countsSentAndFailedPerHour_currentHourLast() {
        val bars = hourlyBars(listOf(now to true, now - 60_000 to false, now - hour to true), now)

        assertEquals(24, bars.size)
        assertEquals(HourBar(sent = 1, failed = 1), bars[23])
        assertEquals(HourBar(sent = 1, failed = 0), bars[22])
    }

    @Test
    fun dropsDeliveriesOlderThan24Hours() {
        val bars = hourlyBars(listOf(now - 25 * hour to true), now)

        assertEquals(0, bars.sumOf { it.total })
    }
}
