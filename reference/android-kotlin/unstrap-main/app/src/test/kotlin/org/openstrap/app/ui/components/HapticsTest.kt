package org.openstrap.app.ui.components

import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HapticsTest {
    @Test fun `throttle lets a tick through at most every interval`() {
        val t = TickThrottle(40)
        assertTrue(t.allow(1_000))
        assertFalse(t.allow(1_010))
        assertFalse(t.allow(1_039))
        assertTrue(t.allow(1_040))
        // A blocked tick doesn't restart the wait.
        assertFalse(t.allow(1_060))
        assertTrue(t.allow(1_080))
    }

    @Test fun `the 3_6 table`() {
        assertEquals(HapticFeedbackType.SegmentFrequentTick, HapticEvent.ScrubStep.feedbackType())
        listOf(HapticEvent.ScrubMark, HapticEvent.ZoneChange, HapticEvent.KmSplit, HapticEvent.SetDone, HapticEvent.RangeMark, HapticEvent.PersonalBest)
            .forEach { assertEquals(HapticFeedbackType.SegmentTick, it.feedbackType()) }
        listOf(HapticEvent.WorkoutStart, HapticEvent.WorkoutEnd, HapticEvent.PairingDone)
            .forEach { assertEquals(HapticFeedbackType.Confirm, it.feedbackType()) }
        assertEquals(HapticFeedbackType.Reject, HapticEvent.SyncFailed.feedbackType())
    }

    @Test fun `zone changes are throttled, a split isn't`() {
        val played = mutableListOf<HapticFeedbackType>()
        var now = 0L
        val haptics = Haptics(object : HapticFeedback {
            override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) { played += hapticFeedbackType }
        }) { now }
        haptics.perform(HapticEvent.ZoneChange)
        now = 3_000; haptics.perform(HapticEvent.ZoneChange)
        haptics.perform(HapticEvent.KmSplit)
        now = Haptics.ZONE_INTERVAL_MS; haptics.perform(HapticEvent.ZoneChange)
        assertEquals(3, played.size)
    }

    @Test fun `scrub steps are throttled, marks are not`() {
        val played = mutableListOf<HapticFeedbackType>()
        var now = 0L
        val haptics = Haptics(object : HapticFeedback {
            override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) { played += hapticFeedbackType }
        }) { now }
        haptics.perform(HapticEvent.ScrubStep)
        now = 20; haptics.perform(HapticEvent.ScrubStep)
        haptics.perform(HapticEvent.ScrubMark)
        haptics.perform(HapticEvent.ScrubMark)
        now = 45; haptics.perform(HapticEvent.ScrubStep)
        assertEquals(
            listOf(HapticFeedbackType.SegmentFrequentTick, HapticFeedbackType.SegmentTick, HapticFeedbackType.SegmentTick, HapticFeedbackType.SegmentFrequentTick),
            played,
        )
    }
}
