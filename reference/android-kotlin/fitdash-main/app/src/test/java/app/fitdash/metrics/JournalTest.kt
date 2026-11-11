package app.fitdash.metrics

import app.fitdash.TODAY
import app.fitdash.settings.DayJournal
import app.fitdash.settings.Tag
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class JournalTest {
    // The `count` days before TODAY carry `tag`.
    private fun journalWith(tag: Tag, count: Int) = (1..count).associate { TODAY.minusDays(it.toLong()) to DayJournal(setOf(tag)) }

    private fun seriesWhere(hrv: (LocalDate) -> Double?) = mapOf(MetricKind.HRV to window(TODAY).map { DayValue(it, hrv(it)) })

    @Test fun `needs five tagged and five untagged days`() {
        assertTrue(tagEffects(journalWith(Tag.ALCOHOL, 4), seriesWhere { 40.0 }, window(TODAY)).isEmpty())
    }

    @Test fun `mean difference against untagged days on the following night`() {
        val journal = journalWith(Tag.ALCOHOL, 10)
        val eff = tagEffects(journal, seriesWhere { d -> if (d.minusDays(1) in journal) 30.0 else 40.0 }, window(TODAY)).single()
        assertEquals(Tag.ALCOHOL, eff.tag)
        assertEquals(10, eff.days)
        assertEquals(-10.0, eff.hrvMs!!, 1e-6)
        assertNull(eff.restingHrBpm)
        assertNull(eff.deepShare)
    }

    @Test fun `ten tags spread over three kinds yields nothing`() {
        val kinds = listOf(Tag.ALCOHOL, Tag.STRESS, Tag.TRAVEL)
        val journal = (1..10).associate { TODAY.minusDays(it.toLong()) to DayJournal(setOf(kinds[it % 3])) }
        assertTrue(tagEffects(journal, seriesWhere { 40.0 }, window(TODAY)).isEmpty())
    }

    @Test fun `deep share is deep over sleep hours and effects sort by hrv`() {
        val journal = journalWith(Tag.ALCOHOL, 6) + (7..12).associate { TODAY.minusDays(it.toLong()) to DayJournal(setOf(Tag.STRESS)) }
        val alcohol = (1..6).map { TODAY.minusDays(it.toLong() - 1) }.toSet()
        val stress = (7..12).map { TODAY.minusDays(it.toLong() - 1) }.toSet()
        val series = seriesWhere { d -> if (d in alcohol) 38.0 else if (d in stress) 30.0 else 40.0 } + mapOf(
            MetricKind.SLEEP_HOURS to window(TODAY).map { DayValue(it, 8.0) },
            MetricKind.DEEP to window(TODAY).map { DayValue(it, if (it in alcohol) 48.0 else 96.0) },
        )
        val effects = tagEffects(journal, series, window(TODAY))
        assertEquals(listOf(Tag.STRESS, Tag.ALCOHOL), effects.map { it.tag })
        assertEquals(-0.1, effects[1].deepShare!!, 1e-6)
        assertEquals(0.0, effects[0].deepShare!!, 1e-6)
    }

    @Test fun `needs five untagged days even with plenty tagged`() {
        val journal = journalWith(Tag.ALCOHOL, 10) + (11..30).associate { TODAY.minusDays(it.toLong()) to DayJournal(setOf(Tag.STRESS)) }
        val window = window(TODAY)
        assertTrue(window.count { journal[it] == null } < 5)
        assertTrue(tagEffects(journal, seriesWhere { 40.0 }, window(TODAY)).isEmpty())
    }

    @Test fun `exactly five tagged and five untagged days gives one effect`() {
        val window = window(TODAY)
        val journal = window.take(5).associateWith { DayJournal(setOf(Tag.ALCOHOL)) } +
            window.drop(10).associateWith { DayJournal(setOf(Tag.STRESS)) }
        assertEquals(5, window.count { journal[it] == null })
        assertEquals(listOf(Tag.ALCOHOL), tagEffects(journal, seriesWhere { 40.0 }, window).map { it.tag }.filter { it == Tag.ALCOHOL })
    }

    @Test fun `hidden until ten tagged days in total`() {
        val nine = journalWith(Tag.ALCOHOL, 5) + (6..9).associate { TODAY.minusDays(it.toLong()) to DayJournal(setOf(Tag.STRESS)) }
        assertTrue(tagEffects(nine, seriesWhere { 40.0 }, window(TODAY)).isEmpty())
        val ten = nine + (TODAY.minusDays(10) to DayJournal(setOf(Tag.STRESS)))
        assertEquals(setOf(Tag.ALCOHOL, Tag.STRESS), tagEffects(ten, seriesWhere { 40.0 }, window(TODAY)).map { it.tag }.toSet())
    }

    @Test fun `untagged days without a following night do not count`() {
        val window = window(TODAY)
        val journal = window.take(5).associateWith { DayJournal(setOf(Tag.ALCOHOL)) } +
            window.drop(5).dropLast(5).associateWith { DayJournal(setOf(Tag.STRESS)) }
        assertEquals(5, window.count { journal[it] == null })
        assertTrue(tagEffects(journal, seriesWhere { 40.0 }, window).isEmpty())
    }
}
