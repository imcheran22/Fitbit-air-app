package com.apex.athlete.core.data.ingest

import java.time.Instant
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The timestamp floor and ceiling: one malformed row must never make a run replay decades of days. */
class ObservationBoundsTest {
    private val now = Instant.parse("2026-11-10T14:00:00Z").toEpochMilli()
    private val today = LocalDate.parse("2026-11-10").toEpochDay()

    @Test
    fun floorConstantsAreTheFirstInstantOf2010() {
        assertEquals(Instant.parse("2010-01-01T00:00:00Z").toEpochMilli(), ObservationBounds.MIN_EPOCH_MILLIS)
        assertEquals(LocalDate.parse("2010-01-01").toEpochDay(), ObservationBounds.MIN_EPOCH_DAY)
    }

    @Test
    fun instantsBeforeTheFloorAreRejected() {
        assertFalse(ObservationBounds.isPlausibleInstant(0L, now))
        assertFalse(ObservationBounds.isPlausibleInstant(1L, now))
        assertFalse(ObservationBounds.isPlausibleInstant(-5L, now))
        assertFalse(ObservationBounds.isPlausibleInstant(Instant.parse("2009-12-31T23:59:59Z").toEpochMilli(), now))
        assertTrue(ObservationBounds.isPlausibleInstant(Instant.parse("2010-01-01T00:00:00Z").toEpochMilli(), now))
    }

    @Test
    fun instantsPastTenMinutesAheadAreRejected() {
        assertTrue(ObservationBounds.isPlausibleInstant(now, now))
        assertTrue(ObservationBounds.isPlausibleInstant(now + 10 * 60_000L, now))
        assertFalse(ObservationBounds.isPlausibleInstant(now + 10 * 60_000L + 1, now))
        assertFalse(ObservationBounds.isPlausibleInstant(Long.MAX_VALUE, now))
    }

    @Test
    fun daysOutsideTheFloorAndTomorrowAreRejected() {
        assertFalse(ObservationBounds.isPlausibleDay(0L, today))
        assertFalse(ObservationBounds.isPlausibleDay(-719_162L, today)) // year 1
        assertFalse(ObservationBounds.isPlausibleDay(ObservationBounds.MIN_EPOCH_DAY - 1, today))
        assertTrue(ObservationBounds.isPlausibleDay(ObservationBounds.MIN_EPOCH_DAY, today))
        assertTrue(ObservationBounds.isPlausibleDay(today, today))
        assertTrue(ObservationBounds.isPlausibleDay(today + 1, today))
        assertFalse(ObservationBounds.isPlausibleDay(today + 2, today))
        assertFalse(ObservationBounds.isPlausibleDay(Long.MAX_VALUE, today))
    }
}
