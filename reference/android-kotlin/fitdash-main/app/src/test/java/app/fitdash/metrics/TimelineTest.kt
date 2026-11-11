package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.health.SleepSession
import app.fitdash.health.Workout
import app.fitdash.night
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalTime

class TimelineTest {
    private val now = TODAY.atTime(21, 0).atZone(IST)

    @Test fun `a night that started yesterday is clipped at midnight`() {
        val t = dayTimeline(listOf(night(TODAY, 7.5)), TODAY, IST, null, now, emptyList(), null, emptyList())!!
        assertEquals(listOf(Span(0, 390, SpanKind.SLEEP)), t.spans)
    }

    @Test fun `a short afternoon sleep is a nap`() {
        val nap = SleepSession(at(TODAY, 14), at(TODAY, 14, 40), emptyList())
        val t = dayTimeline(listOf(nap), TODAY, IST, null, now, emptyList(), null, emptyList())!!
        assertEquals(listOf(Span(840, 880, SpanKind.NAP)), t.spans)
    }

    @Test fun `workouts become spans`() {
        val w = Workout(at(TODAY, 18), at(TODAY, 19), 8)
        val t = dayTimeline(emptyList(), TODAY, IST, null, now, listOf(w), null, emptyList())!!
        assertEquals(listOf(Span(1080, 1140, SpanKind.WORKOUT)), t.spans)
    }

    @Test fun `caffeine cut-off is ten hours before bedtime`() {
        val t = dayTimeline(listOf(night(TODAY, 7.5)), TODAY, IST, LocalTime.of(23, 0), now, emptyList(), null, emptyList())!!
        assertEquals(780, t.caffeineCutoffMin)
        assertEquals(1260, t.nowMin)
    }

    @Test fun `a day with nothing has no timeline`() {
        assertNull(dayTimeline(emptyList(), TODAY, IST, LocalTime.of(23, 0), now, emptyList(), null, emptyList()))
    }
}
