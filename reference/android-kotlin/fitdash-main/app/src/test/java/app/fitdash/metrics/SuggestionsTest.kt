package app.fitdash.metrics

import app.fitdash.TODAY
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

class SuggestionsTest {
    private fun ready(score: Int) = ReadinessResult.Ready(score, band(score), emptyMap())

    private fun sleep(hours: Double) = SleepSummary(
        asleep = Duration.ofSeconds((hours * 3600).toLong()),
        deep = Duration.ZERO, rem = Duration.ZERO, light = Duration.ZERO, awake = Duration.ZERO,
        hasStages = false, score = 80, stages = emptyList(),
        start = Instant.EPOCH, end = Instant.EPOCH, timeInBed = Duration.ZERO, restorative = null, overnightHr = null,
        efficiency = 1.0, awakenings = null, latency = null,
    )

    private fun heart(hrv: Double, base: Double) = HeartSummary(hrv, base, 60.0, 60.0, emptyList(), emptyList(), null, null)

    private fun activity(steps: Long) = ActivitySummary(TODAY, steps, (steps * 100 / 9000).toInt(), List(24) { 0L }, 0, 0.0, 0.0)

    private fun kinds(list: List<Suggestion>) = list.map { it.kind }

    @Test fun `band suggestions`() {
        assertEquals(listOf(SuggestionKind.HARD_WORKOUT), kinds(suggestions(ready(80), null, null, null, 8)))
        assertEquals(listOf(SuggestionKind.MODERATE), kinds(suggestions(ready(55), null, null, null, 8)))
        assertEquals(listOf(SuggestionKind.REST), kinds(suggestions(ready(30), null, null, null, 8)))
    }

    @Test fun `calibrating fires no band suggestion`() {
        assertEquals(emptyList<Suggestion>(), suggestions(ReadinessResult.Calibrating(3), null, null, null, 8))
    }

    @Test fun `short sleep and HRV drop`() {
        assertEquals(listOf(SuggestionKind.EARLIER_BED), kinds(suggestions(ReadinessResult.NoData, sleep(6.5), null, null, 8)))
        assertEquals(emptyList<SuggestionKind>(), kinds(suggestions(ReadinessResult.NoData, sleep(7.0), null, null, 8)))
        assertEquals(listOf(SuggestionKind.EASY_ON_STIMULANTS), kinds(suggestions(ReadinessResult.NoData, null, heart(36.0, 40.0), null, 8)))
        assertEquals(emptyList<SuggestionKind>(), kinds(suggestions(ReadinessResult.NoData, null, heart(37.0, 40.0), null, 8)))
    }

    @Test fun `walk only from 16_00 and below goal`() {
        assertEquals(emptyList<Suggestion>(), suggestions(ReadinessResult.NoData, null, null, activity(6900), 15))
        assertEquals(listOf(Suggestion(SuggestionKind.WALK, 2100)), suggestions(ReadinessResult.NoData, null, null, activity(6900), 16))
        assertEquals(emptyList<Suggestion>(), suggestions(ReadinessResult.NoData, null, null, activity(9000), 20))
    }

    @Test fun `no walk suggestion without activity data`() {
        assertEquals(emptyList<Suggestion>(), suggestions(ReadinessResult.NoData, null, null, null, 21))
    }

    @Test fun `at most three, in rule order`() {
        val all = suggestions(ready(30), sleep(5.0), heart(30.0, 40.0), activity(1000), 20)
        assertEquals(listOf(SuggestionKind.REST, SuggestionKind.EARLIER_BED, SuggestionKind.EASY_ON_STIMULANTS), kinds(all))
    }
}
