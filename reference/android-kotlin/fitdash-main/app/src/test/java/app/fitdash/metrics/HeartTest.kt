package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HeartTest {
    private fun samples(fromMinute: Int, count: Int, stepMinutes: Int, value: (Int) -> Double) =
        (0 until count).map { Sample(at(TODAY, 0).plusSeconds((fromMinute + it * stepMinutes) * 60L), value(it)) }

    @Test fun `day needs at least 10 samples`() {
        assertNull(heartDay(HealthSnapshot(heartRate = samples(0, 9, 1) { 60.0 }), TODAY, IST))
        assertNull(heartDay(HealthSnapshot(heartRate = samples(0, 20, 1) { 60.0 }), TODAY.minusDays(1), IST))
    }

    @Test fun `buckets are 5-minute means with min max avg and latest`() {
        val hr = samples(60, 12, 1) { 60.0 + it } // 01:00..01:11, values 60..71
        val d = heartDay(HealthSnapshot(heartRate = hr), TODAY, IST)!!
        assertEquals(288, d.line.size)
        assertEquals(60, d.min)
        assertEquals(71, d.max)
        assertEquals(66, d.avg)
        assertEquals(71.0, d.latest.value, 0.0)
        assertEquals(62.0, d.line[12]!!, 1e-9) // 01:00..01:04 -> 60..64
        assertEquals(67.0, d.line[13]!!, 1e-9)
        assertEquals(70.5, d.line[14]!!, 1e-9)
        assertNull(d.line[15])
        assertNull(d.line[0])
    }

    @Test fun `samples on another day are ignored`() {
        val hr = samples(60, 12, 1) { 60.0 } + listOf(Sample(at(TODAY.minusDays(1), 12), 150.0))
        assertEquals(60, heartDay(HealthSnapshot(heartRate = hr), TODAY, IST)!!.max)
    }

    @Test fun `line runs break on long gaps`() {
        val line = List(288) { i -> if (i in 10..12 || i in 19..21 || i == 40) 70.0 else null }
        val runs = lineRuns(line, maxGap = 6) // 6 empty slots join, 18 split
        assertEquals(listOf(listOf(10, 11, 12, 19, 20, 21), listOf(40)), runs.map { r -> r.map { it.first } })
        assertEquals(3, lineRuns(line, maxGap = 5).size)
        assertEquals(1, lineRuns(line, maxGap = 30).size)
        assertEquals(0, lineRuns(List(288) { null }).size)
    }

    @Test fun `span line buckets a workout`() {
        val hr = samples(600, 10, 1) { 100.0 + it * 2 } // 10:00..10:09
        val line = spanLine(hr, at(TODAY, 10), at(TODAY, 10, 5), bucketSeconds = 120)
        assertEquals(listOf(101.0, 105.0, 109.0), line)
        assertEquals(emptyList<Double>(), spanLine(hr, at(TODAY, 12), at(TODAY, 13)))
    }

    @Test fun `max heart rate from age`() {
        assertEquals(187, maxHrForAge(30))
        assertEquals(173, maxHrForAge(50))
    }

    @Test fun `zone seconds bucket each reading by share of max`() {
        // max 200: zone floors at 100, 120, 140, 160, 180 bpm.
        val line = listOf(90.0, 100.0, 125.0, 139.9, 140.0, 165.0, 185.0, 199.0)
        assertEquals(listOf(30L, 60L, 30L, 30L, 60L), zoneSeconds(line, 200))
    }
}
