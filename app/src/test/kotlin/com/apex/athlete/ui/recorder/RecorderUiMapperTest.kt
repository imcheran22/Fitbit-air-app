package com.apex.athlete.ui.recorder

import com.apex.athlete.ble.StrapState
import com.apex.athlete.recorder.RecorderSession
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RecorderUiMapperTest {
    private val connected = StrapState.Connected("Strap")
    private val s = RecorderSession.start(0)

    @Test fun zoneFromEstimatedMax() {
        // max 200: zone 3 starts at 140
        val ui = RecorderUiMapper.map(s, 60_000, 145, connected, 200.0, false)
        assertEquals(3, ui.zone); assertEquals(145, ui.bpm); assertEquals("1:00", ui.elapsedText)
    }

    @Test fun belowZoneOneIsZero() {
        assertEquals(0, RecorderUiMapper.map(s, 0, 80, connected, 200.0, false).zone)
    }

    @Test fun noMaxMeansNoZoneButStillShowsHeartRate() {
        val ui = RecorderUiMapper.map(s, 0, 120, connected, null, false)
        assertNull(ui.zone); assertFalse(ui.zonesAvailable); assertEquals(120, ui.bpm)
    }

    @Test fun droppedStrapShowsNoNumber() {
        val ui = RecorderUiMapper.map(s, 0, 120, StrapState.Idle, 200.0, false)
        assertNull(ui.bpm); assertNull(ui.zone)
    }

    @Test fun savableOnlyWhenStoppedAndLongEnough() {
        assertFalse(RecorderUiMapper.map(s, 99_999, null, StrapState.Idle, null, false).savable)
        assertTrue(RecorderUiMapper.map(s.stop(120_000), 200_000, null, StrapState.Idle, null, false).savable)
        assertFalse(RecorderUiMapper.map(s.stop(5_000), 200_000, null, StrapState.Idle, null, false).savable)
        assertNull(RecorderUiMapper.map(null, 0, null, StrapState.Idle, null, true).phase)
    }
}
