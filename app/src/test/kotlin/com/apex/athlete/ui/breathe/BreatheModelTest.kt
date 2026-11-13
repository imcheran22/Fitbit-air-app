package com.apex.athlete.ui.breathe

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.analytics.breathe.BreathePattern
import com.apex.athlete.core.analytics.breathe.BreathePhaseType
import com.apex.athlete.core.analytics.breathe.SpotHrvMissingReason
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.database.entity.BreatheSessionEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.ui.quicklog.WriteOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class BreatheModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun guideScaleFollowsTheBreathAndStaysInRange() {
        val p = BreathePattern.BOX
        assertEquals(0.4f, BreatheGuide.scale(p, p.phaseAt(0)), 1e-4f)          // start of inhale
        assertEquals(0.7f, BreatheGuide.scale(p, p.phaseAt(2_000)), 1e-4f)      // halfway in
        assertEquals(1.0f, BreatheGuide.scale(p, p.phaseAt(5_000)), 1e-4f)      // hold after inhale
        assertEquals(0.7f, BreatheGuide.scale(p, p.phaseAt(10_000)), 1e-4f)     // halfway out
        assertEquals(0.4f, BreatheGuide.scale(p, p.phaseAt(13_000)), 1e-4f)     // hold after exhale
        for (pattern in BreathePattern.entries) {
            var t = 0L
            while (t < pattern.cycleMillis * 2) {
                val s = BreatheGuide.scale(pattern, pattern.phaseAt(t))
                assertTrue(s in 0.4f..1.0f, "$pattern at $t gave $s")
                t += 100
            }
        }
    }

    @Test fun doubleSighTopsUpFromEightyPercentWithoutAJump() {
        val p = BreathePattern.PHYSIOLOGICAL_SIGH
        val endOfFirstInhale = BreatheGuide.scale(p, p.phaseAt(1_999))
        val startOfTopUp = BreatheGuide.scale(p, p.phaseAt(2_000))
        assertEquals(0.8f, startOfTopUp, 1e-4f)
        assertTrue(Math.abs(endOfFirstInhale - startOfTopUp) < 0.01f)
        assertEquals(BreathePhaseType.TOP_UP_INHALE, p.phaseAt(2_500).type)
    }

    @Test fun secondsLeftCountsDownAndNeverShowsZero() {
        val p = BreathePattern.BOX
        assertEquals(4, BreatheGuide.secondsLeftInPhase(p, p.phaseAt(0)))
        assertEquals(1, BreatheGuide.secondsLeftInPhase(p, p.phaseAt(3_999)))
        assertEquals(4, BreatheGuide.secondsLeftInPhase(p, p.phaseAt(4_000)))
    }

    @Test fun completedSecondsIsClamped() {
        assertEquals(0, BreatheGuide.completedSeconds(999, 60))
        assertEquals(12, BreatheGuide.completedSeconds(12_900, 60))
        assertEquals(60, BreatheGuide.completedSeconds(90_000, 60))
        assertEquals(0, BreatheGuide.completedSeconds(-5, 60))
    }

    @Test fun patternKeysRoundTripAndUnknownKeysAreKept() {
        BreathePattern.entries.forEach { assertEquals(it, BreatheGuide.patternOf(BreatheGuide.keyOf(it))) }
        assertNull(BreatheGuide.patternOf("legacy"))
        val rows = BreatheGuide.rows(listOf(BreatheSessionEntity("1", 5, 60, 60, "legacy"), BreatheSessionEntity("2", 9, 60, 30, "BOX")))
        assertEquals(listOf("2", "1"), rows.map { it.id })
        assertEquals("legacy", rows[1].rawKey)
        assertNull(rows[1].pattern)
    }

    @Test fun spotHrvIsUnavailableWithoutAStrapAndWaitingWithoutBeats() {
        assertEquals(SpotHrvUi.NoStrap, spotHrvUi(null))
        assertEquals(SpotHrvUi.Waiting, spotHrvUi(emptyList()))
    }

    @Test fun spotHrvNeverInventsAValueFromTooFewBeats() {
        val r = spotHrvUi(List(10) { 800 }) as SpotHrvUi.Analysed
        assertNull(r.rmssdMs)
        assertEquals(SpotHrvMissingReason.TOO_FEW_BEATS, r.reason)
    }

    @Test fun spotHrvAnalysesAQualifyingRecording() {
        // 90 beats alternating 790 and 810 ms: about 72 s, successive difference 20 ms, so RMSSD is 20.
        val rr = List(90) { if (it % 2 == 0) 790 else 810 }
        val r = spotHrvUi(rr) as SpotHrvUi.Analysed
        assertNull(r.reason)
        assertEquals(20.0, r.rmssdMs!!, 1e-6)
        assertNotNull(r.meanHeartRateBpm)
        assertEquals(DataProvenance.ESTIMATED, com.apex.athlete.core.analytics.breathe.SpotHrv.PROVENANCE_HINT)
    }

    private class Saved { val calls = ArrayList<List<Any>>(); var fail: Exception? = null }

    private fun vm(saved: Saved, rr: kotlinx.coroutines.flow.Flow<List<Int>>? = null, handle: SavedStateHandle = SavedStateHandle()) =
        BreatheViewModel(
            sessions = flowOf(emptyList()), rr = rr, nowMillis = { 1_000L },
            saveSession = { s, p, c, k -> saved.fail?.let { throw it }; saved.calls += listOf(s, p, c, k) },
            removeSession = {}, handle = handle,
        )

    @Test fun finishSavesTheCompletedSecondsAndAPatternKey() {
        val saved = Saved()
        val v = vm(saved)
        v.selectPattern(BreathePattern.BOX)
        v.selectSeconds(60)
        v.start()
        assertNotNull(v.run.value)
        v.selectPattern(BreathePattern.COHERENT) // ignored while running
        v.finish(12_900)
        assertNull(v.run.value)
        assertEquals(listOf<Any>(1_000L, 60, 12, "BOX"), saved.calls.single())
        assertEquals(WriteOutcome.SAVED, v.outcome.value)
        assertEquals(SessionSummary(BreathePattern.BOX, 60, 12, true), v.summary.value)
    }

    @Test fun stoppingBeforeOneSecondSavesNothing() {
        val saved = Saved()
        val v = vm(saved)
        v.start()
        v.finish(400)
        assertTrue(saved.calls.isEmpty())
        assertEquals(0, v.summary.value?.completedSeconds)
    }

    @Test fun demoModeIsCalmAndTheSummaryAdmitsItWasNotSaved() {
        val saved = Saved().also { it.fail = DemoWriteRefusedException() }
        val v = vm(saved)
        v.start()
        v.finish(30_000)
        assertEquals(WriteOutcome.DEMO, v.outcome.value)
        assertEquals(false, v.summary.value?.saved)
    }

    @Test fun lengthMustBeOneOfTheOffered() {
        val v = vm(Saved())
        v.selectSeconds(61)
        assertEquals(BreatheGuide.DEFAULT_DURATION_SECONDS, v.plannedSeconds.value)
    }

    @Test fun choiceSurvivesProcessDeath() {
        val h = SavedStateHandle()
        vm(Saved(), handle = h).apply { selectPattern(BreathePattern.FOUR_SEVEN_EIGHT); selectSeconds(300) }
        val again = vm(Saved(), handle = h)
        assertEquals(BreathePattern.FOUR_SEVEN_EIGHT, again.pattern.value)
        assertEquals(300, again.plannedSeconds.value)
    }

    @Test fun noStrapStateWhenNoStreamIsGiven() {
        assertEquals(SpotHrvUi.NoStrap, vm(Saved(), rr = null).spotHrv.value)
        assertEquals(SpotHrvUi.Waiting, vm(Saved(), rr = MutableStateFlow(emptyList())).spotHrv.value)
    }
}
