package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.night
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import app.fitdash.health.SleepStage
import app.fitdash.health.StageType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.LocalTime

class SleepTest {
    @Test fun `logged night with a late bedtime starts the evening before`() {
        val (start, end) = loggedNight(LocalTime.of(23, 30), LocalTime.of(7, 0), TODAY, IST)
        assertEquals(TODAY.minusDays(1).atTime(23, 30).atZone(IST).toInstant(), start)
        assertEquals(TODAY.atTime(7, 0).atZone(IST).toInstant(), end)
    }

    @Test fun `logged night after midnight starts the same day`() {
        val (start, end) = loggedNight(LocalTime.of(0, 45), LocalTime.of(8, 15), TODAY, IST)
        assertEquals(TODAY.atTime(0, 45).atZone(IST).toInstant(), start)
        assertEquals(Duration.ofMinutes(450), Duration.between(start, end))
    }

    @Test fun `logged night without stages still scores`() {
        val (start, end) = loggedNight(LocalTime.of(23, 0), LocalTime.of(7, 0), TODAY, IST)
        val summary = summarizeSleep(TODAY, listOf(SleepSession(start, end, emptyList())), IST)
        assertTrue(summary != null && summary.score > 0 && !summary.hasStages)
    }

    @Test fun `nightEnding picks the longest session, not a nap`() {
        val main = night(TODAY, 7.0)
        val nap = SleepSession(at(TODAY, 14), at(TODAY, 14, 40), emptyList())
        assertEquals(main, nightEnding(TODAY, listOf(nap, main), IST))
    }

    @Test fun `a lone nap is not a night`() {
        val nap = SleepSession(at(TODAY, 11, 22), at(TODAY, 12, 19), emptyList())
        assertNull(nightEnding(TODAY, listOf(nap), IST))
        assertNull(summarizeSleep(TODAY, listOf(nap), IST))
    }

    @Test fun `a night that crosses midnight belongs to the morning it ends`() {
        val n = night(TODAY, 7.0) // 23:00 on 10 Oct to 06:00 on 11 Oct
        assertEquals(n, nightEnding(TODAY, listOf(n), IST))
        assertNull(nightEnding(TODAY.minusDays(1), listOf(n), IST))
    }

    @Test fun `asleep time excludes awake stages`() {
        assertEquals(Duration.ofMinutes(456), asleepDuration(night(TODAY, 8.0, stages = true)))
        assertEquals(Duration.ofMinutes(432), asleepDuration(night(TODAY, 7.2)))
    }

    @Test fun `deep plus REM share needs stages`() {
        assertEquals(0.45 / 0.95, deepRemShare(night(TODAY, 8.0, stages = true))!!, 1e-6)
        assertNull(deepRemShare(night(TODAY, 8.0)))
    }

    @Test fun `sleep score without stages is hours over target`() {
        assertEquals(90, sleepScore(night(TODAY, 7.2)))
        assertEquals(100, sleepScore(night(TODAY, 9.5)))
    }

    @Test fun `with stages the score has four parts and a long night is not automatically 100`() {
        // 8 h in bed: 20% deep, 25% REM, 50% light, 5% awake at the end. Asleep 7.6 h.
        val n = night(TODAY, 8.0, stages = true)
        val parts = sleepScoreParts(n)!!
        assertEquals(SleepScoreParts(duration = 48, efficiency = 15, restoration = 20, restfulness = 15), parts)
        assertEquals(98, sleepScore(n))
        // 6 h in bed: duration drops, everything else holds.
        assertEquals(SleepScoreParts(36, 15, 20, 15), sleepScoreParts(night(TODAY, 6.0, stages = true)))
        assertEquals(86, sleepScore(night(TODAY, 6.0, stages = true)))
    }

    @Test fun `summary reports stage durations`() {
        val sessions = (0..10).map { night(TODAY.minusDays(it.toLong()), 8.0, stages = true) }
        val s = summarizeSleep(TODAY, sessions, IST)!!
        assertTrue(s.hasStages)
        assertEquals(Duration.ofMinutes(96), s.deep)
        assertEquals(Duration.ofMinutes(120), s.rem)
        assertEquals(Duration.ofMinutes(240), s.light)
        assertEquals(Duration.ofMinutes(24), s.awake)
        assertEquals(98, s.score)
        assertEquals(SleepScoreParts(48, 15, 20, 15), s.parts)
    }

    @Test fun `summary without stages`() {
        val s = summarizeSleep(TODAY, listOf(night(TODAY, 7.2)), IST)!!
        assertFalse(s.hasStages)
        assertEquals(90, s.score)
        assertNull(summarizeSleep(TODAY.minusDays(3), listOf(night(TODAY, 7.2)), IST))
    }


    @Test fun `summary carries bed times and overnight HR`() {
        val n = night(TODAY, 7.0)
        val hr = (0 until 60 step 5).map { Sample(at(TODAY, 2).plusSeconds(it * 60L), 54.0) }
        val s = summarizeSleep(TODAY, listOf(n), IST, heartRate = hr)!!
        assertEquals(Duration.ofHours(7), s.timeInBed)
        assertEquals(n.start, s.start)
        assertEquals(54.0, s.overnightHr!!, 1e-9)
    }
}

class SleepQualityTest {
    private fun stage(type: StageType, startMin: Int, endMin: Int) =
        SleepStage(at(TODAY, 0).plusSeconds(startMin * 60L), at(TODAY, 0).plusSeconds(endMin * 60L), type)

    // In bed 00:00–08:00. Awake 0–10, light 10–120, awake 120–130, deep 130–300, awake 300–310, rem 310–470, awake 470–480.
    private val night = SleepSession(
        at(TODAY, 0), at(TODAY, 8),
        listOf(
            stage(StageType.AWAKE, 0, 10), stage(StageType.LIGHT, 10, 120), stage(StageType.AWAKE, 120, 130),
            stage(StageType.DEEP, 130, 300), stage(StageType.AWAKE, 300, 310), stage(StageType.REM, 310, 470),
            stage(StageType.AWAKE, 470, 480),
        ),
    )

    @Test fun `awakenings ignore the leading and trailing awake`() {
        assertEquals(2, awakenings(night))
        assertNull(awakenings(night(TODAY, 8.0)))
    }

    @Test fun `latency is time to the first sleep stage`() {
        assertEquals(Duration.ofMinutes(10), sleepLatency(night))
        assertNull(sleepLatency(night(TODAY, 8.0)))
    }

    @Test fun `efficiency is asleep over time in bed`() {
        assertEquals(440.0 / 480.0, sleepEfficiency(night), 1e-9)
        assertEquals(1.0, sleepEfficiency(night(TODAY, 8.0)), 1e-9)
        val s = summarizeSleep(TODAY, listOf(night), IST)!!
        assertEquals(440.0 / 480.0, s.efficiency, 1e-9)
        assertEquals(2, s.awakenings)
        assertEquals(Duration.ofMinutes(10), s.latency)
        assertEquals(SleepScoreParts(46, 15, 20, 10), s.parts)
        assertEquals(91, s.score)
    }

    @Test fun `status bands`() {
        assertEquals(Status.OPTIMAL, efficiencyStatus(0.92))
        assertEquals(Status.GOOD, efficiencyStatus(0.86))
        assertEquals(Status.FAIR, efficiencyStatus(0.80))
        assertEquals(Status.BELOW_USUAL, efficiencyStatus(0.60))
        assertEquals(Status.OPTIMAL, awakeningsStatus(2))
        assertEquals(Status.GOOD, awakeningsStatus(4))
        assertEquals(Status.FAIR, awakeningsStatus(6))
        assertEquals(Status.BELOW_USUAL, awakeningsStatus(7))
    }

    @Test fun `goal percent is asleep time against the target, capped at 100`() {
        assertEquals(75, summarizeSleep(TODAY, listOf(night(TODAY, 6.0)), IST, 8.0)!!.goalPercent)
        assertEquals(100, summarizeSleep(TODAY, listOf(night(TODAY, 9.0)), IST, 8.0)!!.goalPercent)
    }

    @Test fun `sleep guideline follows the NSF 2015 age bands`() {
        assertEquals(8..10, sleepGuideline(17))
        assertEquals(7..9, sleepGuideline(18))
        assertEquals(7..9, sleepGuideline(64))
        assertEquals(7..8, sleepGuideline(65))
        assertNull(sleepGuideline(13))
        assertEquals("National Sleep Foundation 2015", NSF_SLEEP.title)
    }

    @Test fun `medianBedtime sits across midnight`() {
        val starts = listOf(at("2026-10-09", "23:00"), at("2026-10-10", "23:30"), at("2026-10-11", "01:00"))
        assertEquals(java.time.LocalTime.of(23, 30), medianBedtime(starts, IST))
        assertNull(medianBedtime(emptyList(), IST))
    }

    @Test fun `medianBedtime uses only the last 14 nights`() {
        val old = (1..10).map { at(TODAY.minusDays(30L + it), 20) }
        val recent = (1..14).map { at(TODAY.minusDays(it.toLong()), 23) }
        assertEquals(java.time.LocalTime.of(23, 0), medianBedtime(old + recent, IST))
    }
}
