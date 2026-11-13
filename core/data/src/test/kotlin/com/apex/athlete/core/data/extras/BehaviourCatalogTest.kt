package com.apex.athlete.core.data.extras

import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.database.entity.BehaviourDefEntity
import com.apex.athlete.core.database.entity.BehaviourEntryEntity
import com.apex.athlete.core.database.entity.BehaviourKind
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BehaviourCatalogTest {

    private fun custom(id: String, order: Int, kind: BehaviourKind = BehaviourKind.YES_NO, archived: Boolean = false) =
        BehaviourDefEntity("custom:$id", id.replaceFirstChar { it.uppercase() }, kind, "icon", order, archived)

    @Test fun theFiveBuiltInFactorsAreExposedInJournalOrder() {
        val merged = BehaviourCatalog.merge(emptyList())
        assertEquals(JournalDay.FACTORS.map { it.storageKey }, merged.map { it.id })
        assertEquals(listOf(0, 1, 2, 3, 4), merged.map { it.sortOrder })
        assertTrue(merged.all { it.builtIn && it.kind == BehaviourKind.YES_NO && !it.archived && it.name.isNotBlank() })
        assertEquals(5, merged.map { it.name }.toSet().size)
        assertEquals(MetricType.JOURNAL_ALCOHOL, BehaviourCatalog.builtInMetric("journal_alcohol"))
        assertNull(BehaviourCatalog.builtInMetric("custom:x"))
        assertEquals("journal_travel", BehaviourCatalog.builtInId(MetricType.JOURNAL_TRAVEL))
    }

    @Test fun customBehavioursSortAfterBuiltInsAndOverridesApplyToBuiltIns() {
        val rows = listOf(
            custom("sauna", 7),
            custom("reading", 5, BehaviourKind.SCALE_0_4),
            // An override of a built-in factor: renamed, moved to the front, archived.
            BehaviourDefEntity("journal_travel", "Trips", BehaviourKind.YES_NO, "plane", -1, archived = true),
        )
        val merged = BehaviourCatalog.merge(rows)
        assertEquals(listOf("journal_travel", "journal_alcohol", "journal_late_caffeine", "journal_late_meal", "journal_stressful_day", "custom:reading", "custom:sauna"), merged.map { it.id })
        val travel = merged.first()
        assertEquals("Trips", travel.name); assertEquals("plane", travel.iconKey); assertTrue(travel.archived && travel.builtIn)
        assertEquals(5, merged.count { it.builtIn }, "an override row never adds a sixth built-in")
        assertEquals(BehaviourKind.SCALE_0_4, merged.first { it.id == "custom:reading" }.kind)
    }

    @Test fun aTieOnSortOrderListsTheBuiltInFirst() {
        val merged = BehaviourCatalog.merge(listOf(custom("tie", 2)))
        assertEquals(listOf("journal_late_meal", "custom:tie"), merged.filter { it.sortOrder == 2 }.map { it.id })
    }

    @Test fun dayValuesKeepMissingMissingAndHideArchived() {
        val merged = BehaviourCatalog.merge(listOf(custom("sauna", 5), custom("old", 6, archived = true)))
        val entries = listOf(BehaviourDayEntry(20_000, "journal_alcohol", 0.0), BehaviourDayEntry(20_000, "custom:sauna", 1.0))
        val shown = BehaviourCatalog.dayValues(merged, entries, includeArchived = false)
        assertEquals(listOf("journal_alcohol", "journal_late_caffeine", "journal_late_meal", "journal_stressful_day", "journal_travel", "custom:sauna"), shown.map { it.behaviour.id })
        assertEquals(0.0, shown.first { it.behaviour.id == "journal_alcohol" }.value, "an answered no is 0, not missing")
        assertNull(shown.first { it.behaviour.id == "journal_travel" }.value, "not logged is null, never 0")
        assertEquals(1.0, shown.last().value)
        assertEquals(7, BehaviourCatalog.dayValues(merged, entries, includeArchived = true).size)
    }

    @Test fun builtInRowsAndCustomEntriesMergeByDayThenId() {
        fun daily(metric: MetricType, day: Long, v: Double) = DailyBiometricSummaryEntity(metric, day, v, DataProvenance.USER_REPORTED, updatedAtEpochMillis = 1)
        val merged = BehaviourCatalog.entries(
            builtIn = listOf(daily(MetricType.JOURNAL_ALCOHOL, 5, 1.0), daily(MetricType.JOURNAL_TRAVEL, 4, 0.0), daily(MetricType.STEPS, 4, 9000.0)),
            custom = listOf(BehaviourEntryEntity(4, "custom:a", 3.0, 1)),
        )
        assertEquals(listOf(4L to "custom:a", 4L to "journal_travel", 5L to "journal_alcohol"), merged.map { it.epochDay to it.behaviourId })
    }

    @Test fun valuesAreCheckedAgainstTheKind() {
        BehaviourCatalog.requireValid(BehaviourKind.YES_NO, 0.0)
        BehaviourCatalog.requireValid(BehaviourKind.YES_NO, 1.0)
        for (bad in listOf(0.5, 2.0, -1.0, Double.NaN)) assertFailsWith<IllegalArgumentException>("$bad") { BehaviourCatalog.requireValid(BehaviourKind.YES_NO, bad) }
        for (ok in 0..4) BehaviourCatalog.requireValid(BehaviourKind.SCALE_0_4, ok.toDouble())
        for (bad in listOf(-1.0, 5.0, 2.5, Double.POSITIVE_INFINITY)) assertFailsWith<IllegalArgumentException>("$bad") { BehaviourCatalog.requireValid(BehaviourKind.SCALE_0_4, bad) }
    }
}
